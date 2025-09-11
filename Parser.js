const os = require('os');
const path = require('path');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const cheerio = require('cheerio');
const mysql = require('mysql2/promise');
const moment = require('moment');


const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root',  
    database: 'schedule_db'
};


async function cleanOldSchedule() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log("Подключились к БД для очистки ВСЕХ старых записей."); 
        console.log("Удаляем ВСЕ записи из таблиц schedule и teacher_schedule."); 
        await connection.execute("DELETE FROM schedule"); 
        await connection.execute("DELETE FROM teacher_schedule"); 
        console.log("Все старые записи успешно удалены."); 
    } catch (error) {
        console.error("Ошибка при очистке БД:", error);
    } finally {
        if (connection) await connection.end();
    }
}


async function saveScheduleToDB(allSchedules) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log("Connected to the database (студенты).");
        for (let groupData of allSchedules) {
            const groupName = groupData.group;
            const scheduleDate = groupData.date;

            let [rows] = await connection.execute(
                "SELECT id FROM `groups` WHERE group_name = ?",
                [groupName]
            );
            let groupId;
            if (rows.length === 0) {
                const [result] = await connection.execute(
                    "INSERT INTO `groups` (group_name) VALUES (?)",
                    [groupName]
                );
                groupId = result.insertId;
                console.log(`Новая группа добавлена: ${groupName} (id: ${groupId})`);
            } else {
                groupId = rows[0].id;
                console.log(`Группа уже существует: ${groupName} (id: ${groupId})`);
            }

            for (let lesson of groupData.schedule) {
                const [existing] = await connection.execute(
                    `SELECT id FROM schedule
                     WHERE group_id = ? AND schedule_date = ? AND lesson_number = ?`,
                    [groupId, scheduleDate, lesson.lessonNumber]
                );
                if (existing.length > 0) {
                    console.log(`Дублирующая запись пропущена: группа "${groupName}", дата "${scheduleDate}", урок "${lesson.lessonNumber}"`);
                    continue;
                }
                await connection.execute(
                    `INSERT INTO schedule 
                     (group_id, schedule_date, lesson_number, subject, room, teacher) 
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [groupId, scheduleDate, lesson.lessonNumber, lesson.subject, lesson.room, lesson.teacher]
                );
                console.log(`Добавлен урок "${lesson.subject}" для группы "${groupName}" на ${scheduleDate}.`);
            }
        }
        console.log("Данные студентов успешно сохранены в БД.");
    } catch (error) {
        console.error("Ошибка при сохранении студентов в БД:", error);
    } finally {
        if (connection) await connection.end();
    }
}


async function saveTeacherScheduleToDB(allTeacherSchedules) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log("Подключились к БД для расписания преподавателей.");
        for (let teacherData of allTeacherSchedules) {
            const teacherName = teacherData.teacher;
            const scheduleDate = teacherData.date;
            let [rows] = await connection.execute(
                "SELECT id FROM teachers WHERE teacher_name = ?",
                [teacherName]
            );
            let teacherId;
            if (rows.length === 0) {
                const [result] = await connection.execute(
                    "INSERT INTO teachers (teacher_name) VALUES (?)",
                    [teacherName]
                );
                teacherId = result.insertId;
                console.log(`Новый преподаватель добавлен: ${teacherName} (id: ${teacherId})`);
            } else {
                teacherId = rows[0].id;
                console.log(`Преподаватель уже существует: ${teacherName} (id: ${teacherId})`);
            }
            for (let lesson of teacherData.schedule) {
                let [existing] = await connection.execute(
                    "SELECT id FROM teacher_schedule WHERE teacher_id = ? AND schedule_date = ? AND lesson_number = ?",
                    [teacherId, scheduleDate, lesson.lessonNumber]
                );
                if (existing.length > 0) {
                    console.log(`Дублирующая запись пропущена: преподаватель "${teacherName}", дата "${scheduleDate}", урок "${lesson.lessonNumber}"`);
                    continue;
                }

                await connection.execute(
                    `INSERT INTO teacher_schedule
                     (teacher_id, schedule_date, lesson_number, subject, room, \`group\`)  -- Добавлено поле 'group' в список полей
                     VALUES (?, ?, ?, ?, ?, ?)`,  
                    [teacherId, scheduleDate, lesson.lessonNumber, lesson.subject, lesson.room, lesson.group] 
                );
                console.log(`Добавлен урок "${lesson.subject}" для преподавателя "${teacherName}" на ${scheduleDate}.`);
            }
        }
        console.log("Данные преподавателей успешно сохранены в БД.");
    } catch (error) {
        console.error("Ошибка при сохранении преподавателей в БД:", error);
    } finally {
        if (connection) await connection.end();
    }
}


function getCurrentWeek() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff);
    const dates = [];
    for (let i = 0; i < 6; i++) {
        let date = new Date(monday);
        date.setDate(monday.getDate() + i);
        dates.push(date);
    }
    return dates;
}

function getNextWeek() {
    const currentWeek = getCurrentWeek();
    const nextMonday = new Date(currentWeek[0]);
    nextMonday.setDate(currentWeek[0].getDate() + 7);
    const dates = [];
    for (let i = 0; i < 6; i++) {
        let date = new Date(nextMonday);
        date.setDate(nextMonday.getDate() + i);
        dates.push(date);
    }
    return dates;
}


async function handleAlert(driver) {
    try {
        await driver.wait(until.alertIsPresent(), 5000);
        let alert = await driver.switchTo().alert();
        console.log("Обнаружен alert: " + await alert.getText());
        await alert.accept();
        console.log("Alert закрыт.");
    } catch (e) {
       
    }
}


async function processWeek(weekDates, weekLabel) {
    let options = new chrome.Options();
    options.addArguments('headless', 'disable-gpu', 'no-sandbox', '--disable-dev-shm-usage', '--incognito');
    let driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    const url = 'https://www.uc.osu.ru/asd.php';
    let allSchedules = [];
    try {
        for (const currentDate of weekDates) {
            const year = currentDate.getFullYear();
            const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
            const day = currentDate.getDate().toString();
            const formattedDate = `${year}-${month}-${day}`;
            try {
                await driver.get(url);
                const calendarLocator = By.id('fc');
                await driver.wait(until.elementLocated(calendarLocator), 30000);
                let dayFound = await driver.executeScript(`
                    var calendar = document.getElementById('fc');
                    if (calendar) {
                        var targetDate = '${day}';
                        var dayElements = calendar.getElementsByTagName('td');
                        for (var i = 0; i < dayElements.length; i++) {
                            if (dayElements[i].innerText.trim() === targetDate) {
                                dayElements[i].click();
                                return true;
                            }
                        }
                    }
                    return false;
                `);
                async function switchToNextMonthDirect(driver) {
                    try {
                        await driver.executeScript("caddm()");
                        await driver.sleep(2000);
                        console.log("Успешно переключились на следующий месяц через JS.");
                        return true;
                    } catch (error) {
                        console.error("Ошибка переключения на следующий месяц через JS:", error);
                        return false;
                    }
                }
                if (!dayFound) {
                    console.log(`День ${day} не найден, переключаемся на следующий месяц.`);
                    let switchSuccessful = await switchToNextMonthDirect(driver);
                    if (!switchSuccessful) continue;
                    dayFound = await driver.executeScript(`
                        var calendar = document.getElementById('fc');
                        if (calendar) {
                            var targetDate = '${day}';
                            var dayElements = calendar.getElementsByTagName('td');
                            for (var i = 0; i < dayElements.length; i++) {
                                if (dayElements[i].innerText.trim() === targetDate) {
                                    dayElements[i].click();
                                    return true;
                                }
                            }
                        }
                        return false;
                    `);
                    if (!dayFound) {
                        console.log(`Не удалось выбрать день ${day} даже после переключения месяца.`);
                        continue;
                    }
                }
                console.log(`${weekLabel ? weekLabel + ' ' : ''}Выбрана дата: ${formattedDate}`);
                await driver.sleep(2000);
 
                const typeSelectLocator = By.id('type_user_id');
                await driver.wait(until.elementLocated(typeSelectLocator), 30000);
                const typeSelect = await driver.findElement(typeSelectLocator);
                await driver.executeScript(
                    "arguments[0].value = '1'; arguments[0].dispatchEvent(new Event('change'));",
                    typeSelect
                );
                console.log("Выбран тип расписания: Студент");

                const groupSelectLocator = By.id('group_pick');
                await driver.wait(until.elementLocated(groupSelectLocator), 30000);
                const groupSelect = await driver.findElement(groupSelectLocator);
                await driver.wait(async () => {
                    let opts = await groupSelect.findElements(By.tagName('option'));
                    return opts.length > 1;
                }, 30000);
                let optionElements = await groupSelect.findElements(By.tagName('option'));
                let groups = [];
                for (let i = 0; i < optionElements.length; i++) {
                    let optionText = await optionElements[i].getText();
                    let optionValue = await optionElements[i].getAttribute('value');
                    if (optionValue.trim() !== "" && optionText.trim() !== 'Выберите' && optionText.trim() !== '---') {
                        groups.push({ text: optionText, value: optionValue });
                    }
                }
                console.log("Найденные группы:", groups);

                for (let group of groups) {
                    console.log(`Выбор группы: ${group.text}`);
                    await driver.executeScript(
                        "arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('change'));",
                        groupSelect, group.value
                    );
                    const dataLocator = By.id('data');
                    await driver.wait(until.elementLocated(dataLocator), 30000);
                    const dataElement = await driver.findElement(dataLocator);
                    await driver.wait(async () => {
                        let html = await dataElement.getAttribute('innerHTML');
                        return html && html.trim().length > 0;
                    }, 30000);
                    const html = await dataElement.getAttribute('innerHTML');
                    const $ = cheerio.load(html);
                    const table = $('table');
                    if (!table.length) {
                        console.log(`Таблица расписания не найдена для группы "${group.text}" на ${formattedDate}. Добавляем группу с пустым расписанием.`);
                        allSchedules.push({ group: group.text, schedule: [], date: formattedDate });
                        continue;
                    }
                    const rows = table.find('tr');
                    if (rows.length < 3) {
                        console.log(`Таблица расписания для группы "${group.text}" на ${formattedDate} пуста или имеет неожиданную структуру. Добавляем группу с пустым расписанием.`);
                        allSchedules.push({ group: group.text, schedule: [], date: formattedDate });
                        continue;
                    }
                    const headerRow = rows.eq(0);
                    const groupFromHeader = headerRow.find('b').text().trim() || group.text;
                    let schedule = [];
                    for (let i = 1; i < rows.length; i += 2) {
                        const row1 = rows.eq(i);
                        const row2 = (i + 1) < rows.length ? rows.eq(i + 1) : null;
                        const cellsRow1 = row1.find('td');
                        if (cellsRow1.length < 3) continue;
                        const lessonNumber = cellsRow1.eq(0).text().trim();
                        const subject = cellsRow1.eq(1).text().trim();
                        const room = cellsRow1.eq(2).text().trim();
                        let teacher = "";
                        if (row2) {
                            teacher = row2.find('td').first().text().trim();
                        }
                        schedule.push({
                            lessonNumber,
                            subject,
                            room,
                            teacher,
                            group: groupFromHeader
                        });
                    }
                    console.log(`Спарсено расписание для группы "${group.text}" на ${formattedDate}:`, schedule);
                    allSchedules.push({ group: group.text, schedule: schedule, date: formattedDate });
                }
            } catch (error) {
                console.error(`Ошибка при обработке даты ${formattedDate}:`, error);
                continue;
            }
        }
        console.log("Все данные студентов успешно спарсены.");

        await saveScheduleToDB(allSchedules);
    } catch (error) {
        console.error("Ошибка при обработке недели студентов:", error);
    } finally {
        await driver.quit();
    }
}


async function processTeacherWeek(weekDates, weekLabel) {
    let options = new chrome.Options();
    options.addArguments('headless', 'disable-gpu', 'no-sandbox', '--disable-dev-shm-usage', '--incognito');
    let driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
    const url = 'https://www.uc.osu.ru/asd.php';
    let allTeacherSchedules = [];
    try {
        for (const currentDate of weekDates) {
            const year = currentDate.getFullYear();
            const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
            const day = currentDate.getDate().toString();
            const formattedDate = `${year}-${month}-${day}`;
            try {
                await driver.get(url);
                const calendarLocator = By.id('fc');
                await driver.wait(until.elementLocated(calendarLocator), 30000);
                let dayFound = await driver.executeScript(`
                    var calendar = document.getElementById('fc');
                    if (calendar) {
                        var targetDate = '${day}';
                        var dayElements = calendar.getElementsByTagName('td');
                        for (var i = 0; i < dayElements.length; i++) {
                            if (dayElements[i].innerText.trim() === targetDate) {
                                dayElements[i].click();
                                return true;
                            }
                        }
                    }
                    return false;
                `);
                async function switchToNextMonthDirect(driver) {
                    try {
                        await driver.executeScript("caddm()");
                        await driver.sleep(2000);
                        console.log("Успешно переключились на следующий месяц через JS.");
                        return true;
                    } catch (error) {
                        console.error("Ошибка переключения на следующий месяц через JS:", error);
                        return false;
                    }
                }
                if (!dayFound) {
                    console.log(`День ${day} не найден, переключаемся на следующий месяц.`);
                    let switchSuccessful = await switchToNextMonthDirect(driver);
                    if (!switchSuccessful) continue;
                    dayFound = await driver.executeScript(`
                        var calendar = document.getElementById('fc');
                        if (calendar) {
                            var targetDate = '${day}';
                            var dayElements = calendar.getElementsByTagName('td');
                            for (var i = 0; i < dayElements.length; i++) {
                                if (dayElements[i].innerText.trim() === targetDate) {
                                    dayElements[i].click();
                                    return true;
                                }
                            }
                        }
                        return false;
                    `);
                    if (!dayFound) {
                        console.log(`Не удалось выбрать день ${day} даже после переключения месяца.`);
                        continue;
                    }
                }
                console.log(`${weekLabel ? weekLabel + ' ' : ''}Выбрана дата: ${formattedDate}`);
                await driver.sleep(2000);
  
                const typeSelectLocator = By.id('type_user_id');
                await driver.wait(until.elementLocated(typeSelectLocator), 30000);
                const typeSelect = await driver.findElement(typeSelectLocator);
                await driver.executeScript(
                    "arguments[0].value = '2'; arguments[0].dispatchEvent(new Event('change'));",
                    typeSelect
                );
                console.log("Выбран тип расписания: Преподавателя");
    
                const nameSelectLocator = By.id('name_pick');
                await driver.wait(until.elementLocated(nameSelectLocator), 30000);
                const nameSelect = await driver.findElement(nameSelectLocator);
                await driver.wait(async () => {
                    let opts = await nameSelect.findElements(By.tagName('option'));
                    return opts.length > 1;
                }, 30000);
                let optionElements = await nameSelect.findElements(By.tagName('option'));
                let teachers = [];
                for (let i = 0; i < optionElements.length; i++) {
                    let optionText = await optionElements[i].getText();
                    let optionValue = await optionElements[i].getAttribute('value');
                    if (optionValue.trim() !== "" && optionText.trim() !== '---') {
                        teachers.push({ text: optionText, value: optionValue });
                    }
                }
                console.log("Найденные преподаватели:", teachers);

                for (let teacher of teachers) {
                    console.log(`Выбор преподавателя: ${teacher.text}`);
                    await driver.executeScript(
                        "arguments[0].value = arguments[1]; arguments[0].dispatchEvent(new Event('change'));",
                        nameSelect, teacher.value
                    );
                    const dataLocator = By.id('data');
                    await driver.wait(until.elementLocated(dataLocator), 30000);
                    const dataElement = await driver.findElement(dataLocator);
                    await driver.wait(async () => {
                        let html = await dataElement.getAttribute('innerHTML');
                        return html && html.trim().length > 0;
                    }, 30000);
                    const html = await dataElement.getAttribute('innerHTML');
                    const $ = cheerio.load(html);
      
                    const table = $('#tabdata').length ? $('#tabdata') : $('table');
                    if (!table.length) {
                        console.log(`Таблица расписания не найдена для преподавателя "${teacher.text}" на ${formattedDate}.`);
                        continue;
                    }
                    const rows = table.find('tr');
                    let schedule = [];

                    for (let i = 0; i < rows.length; i += 2) {
                        const row1 = rows.eq(i);
                        const row2 = rows.eq(i + 1);
                        const cellsRow1 = row1.find('td');
                        if (cellsRow1.length < 3) continue;
                        const lessonNumber = cellsRow1.eq(0).text().trim();
                        const subject = cellsRow1.eq(1).text().trim();
                        const room = cellsRow1.eq(2).text().trim();
                        
                        const groupInfo = row2.find('td').first().text().trim();
                        schedule.push({
                            lessonNumber,
                            subject,
                            room,
                            group: groupInfo
                        });
                    }
                    console.log(`Спарсено расписание для преподавателя "${teacher.text}" на ${formattedDate}:`, schedule);
                    allTeacherSchedules.push({ teacher: teacher.text, schedule: schedule, date: formattedDate });
                }
            } catch (error) {
                console.error(`Ошибка при обработке даты ${formattedDate}:`, error);
                continue;
            }
        }
        console.log("Все данные преподавателей успешно спарсены:", allTeacherSchedules);
        return allTeacherSchedules;
    } catch (error) {
        console.error("Ошибка при обработке недели преподавателей:", error);
        return [];
    } finally {
        await driver.quit();
    }
}


(async function main() {
    
    await cleanOldSchedule();

    console.log("Парсинг расписания студентов для текущей недели...");
    const currentWeek = getCurrentWeek();
    await processWeek(currentWeek, "Текущая неделя");

    console.log("Парсинг расписания студентов для следующей недели...");
    const nextWeek = getNextWeek();
    await processWeek(nextWeek, "Следующая неделя"); 


    console.log("Парсинг расписания преподавателей для текущей недели...");
    const teacherSchedulesCurrent = await processTeacherWeek(currentWeek, "Текущая неделя");
    console.log("Парсинг расписания преподавателей для следующей недели...");
    const nextWeekTeacher = getNextWeek(); 
    const teacherSchedulesNext = await processTeacherWeek(nextWeekTeacher, "Следующая неделя");

    const allTeacherSchedules = teacherSchedulesCurrent.concat(teacherSchedulesNext);
    console.log("Сохранение расписания преподавателей в БД...");
    await saveTeacherScheduleToDB(allTeacherSchedules);

    console.log("Парсинг расписания завершён.");
    console.log("Очистка БД от старых записей...");
   
})();
