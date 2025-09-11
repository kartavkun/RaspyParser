const express = require('express');
const mysql = require('mysql2/promise');
const moment = require('moment');

const app = express();
const port = process.env.PORT || 3000;


const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'schedule_db'
};

// Эндпоинт /groups 
app.get('/groups', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [groups] = await connection.execute('SELECT id, group_name FROM `groups` ORDER BY group_name');
        const formattedGroups = groups.map(group => ({
            type: 'group',
            name: group.group_name
        }));
        res.json(formattedGroups);
    } catch (error) {
        console.error("Ошибка при получении списка групп:", error);
        res.status(500).json({ error: "Ошибка сервера" });
    } finally {
        if (connection) await connection.end();
    }
});

// Эндпоинт /teachers
app.get('/teachers', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [teachers] = await connection.execute('SELECT id, teacher_name FROM teachers ORDER BY teacher_name');
        const formattedTeachers = teachers.map(teacher => ({
            type: 'teacher',
            name: teacher.teacher_name
        }));
        res.json(formattedTeachers);
    } catch (error) {
        console.error("Ошибка при получении списка преподавателей:", error);
        res.status(500).json({ error: "Ошибка сервера" });
    } finally {
        if (connection) await connection.end();
    }
});
// Эндпоинт /rooms
app.get('/rooms', async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        const [rooms] = await connection.execute('SELECT DISTINCT room FROM schedule ORDER BY room');
        const formattedRooms = rooms.map(room => ({
            type: 'room',
            name: room.room
        }));
        res.json(formattedRooms);
    } catch (error) {
        console.error("Ошибка при получении списка аудиторий:", error);
        res.status(500).json({ error: "Ошибка сервера" });
    } finally {
        if (connection) await connection.end();
    }
});

// Эндпоинт /schedule
app.get('/schedule', async (req, res) => {
    const { group_name } = req.query;
    if (!group_name) {
        return res.status(400).json({ error: "Параметр group_name обязателен" });
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        const [groupRows] = await connection.execute(
            'SELECT id FROM `groups` WHERE group_name = ?',
            [group_name]
        );
        if (groupRows.length === 0) {
            return res.status(404).json({ error: "Группа не найдена" });
        }
        const groupId = groupRows[0].id;

        const [scheduleRows] = await connection.execute(

            'SELECT id, group_id, schedule_date, lesson_number, subject, room, teacher, last_updated FROM schedule WHERE group_id = ? ORDER BY schedule_date, lesson_number',
            [groupId]
        );

        const formattedSchedule = scheduleRows.map(row => ({
            ...row,
            schedule_date: moment(row.schedule_date).format('DD.MM.YYYY'),
            lastUpdated: moment(row.last_updated).valueOf(), //  в миллисекундах
        }));

        res.json(formattedSchedule);
    } catch (error) {
        console.error("Ошибка при получении расписания группы:", error);
        res.status(500).json({ error: "Ошибка сервера" });
    } finally {
        if (connection) await connection.end();
    }
});

// Эндпоинт /schedule/teacher
app.get('/schedule/teacher', async (req, res) => {
    const { teacher_name, date } = req.query;

    if (!teacher_name) {
        return res.status(400).json({ error: "Параметр teacher_name обязателен" });
    }
    if (!date) {
        return res.status(400).json({ error: "Параметр date обязателен" });
    }

    if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
        return res.status(400).json({ error: "Неверный формат даты. Используйте YYYY-MM-DD" });
    }
    const scheduleDate = moment(date, 'YYYY-MM-DD').format('YYYY-MM-DD');

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        const [teacherRows] = await connection.execute(
            'SELECT id FROM teachers WHERE teacher_name = ?',
            [teacher_name]
        );
        if (teacherRows.length === 0) {
            return res.status(404).json({ error: "Преподаватель не найден" });
        }
        const teacherId = teacherRows[0].id;

        const [scheduleRows] = await connection.execute(
  
            `SELECT
                ts.id,
                ts.teacher_id,
                ts.schedule_date,
                ts.lesson_number,
                ts.subject,
                ts.room,
                t.teacher_name AS teacher,
                ts.\`group\` AS \`group\`,
                ts.last_updated
            FROM teacher_schedule ts
            JOIN teachers t ON ts.teacher_id = t.id
            WHERE ts.teacher_id = ? AND ts.schedule_date = ?
            ORDER BY ts.lesson_number`,
            [teacherId, scheduleDate]
        );

        const formattedSchedule = scheduleRows.map(row => ({
            ...row,
            schedule_date: moment(row.schedule_date).format('DD.MM.YYYY'),
            lastUpdated: moment(row.last_updated).valueOf(), //  в миллисекундах
        }));

        res.json(formattedSchedule);

    } catch (error) {
        console.error("Ошибка при получении расписания преподавателя:", error);
        res.status(500).json({ error: "Ошибка сервера" });
    } finally {
        if (connection) await connection.end();
    }
});

// Эндпоинт /schedule/room
app.get('/schedule/room', async (req, res) => {
    const { room, date } = req.query;

    if (!room) {
        return res.status(400).json({ error: "Параметр room обязателен" });
    }

    let queryDate = date;
    if (!queryDate) {
        queryDate = moment().format('YYYY-MM-DD');
    } else {
        if (!moment(queryDate, 'YYYY-MM-DD', true).isValid()) {
            return res.status(400).json({ error: "Неверный формат даты. Используйте YYYY-MM-DD" });
        }
    }

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        const [scheduleRows] = await connection.execute(
            'SELECT s.id, g.group_name, s.schedule_date, s.lesson_number, s.subject, s.room, s.teacher, s.last_updated ' +
            'FROM schedule s ' +
            'JOIN `groups` g ON s.group_id = g.id ' +
            'WHERE s.room = ? AND s.schedule_date = ? ' +
            'ORDER BY s.schedule_date, s.lesson_number',
            [room, queryDate]
        );

        const formattedSchedule = scheduleRows.map(row => ({
            ...row,
            group: row.group_name,
            schedule_date: moment(row.schedule_date).format('DD.MM.YYYY'),
            lesson_number: row.lesson_number.toString(),
            lastUpdated: moment(row.last_updated).valueOf(), //  в миллисекундах

        }));

        res.json(formattedSchedule);

    } catch (error) {
        console.error("Ошибка при получении расписания:", error);
        res.status(500).json({ error: "Ошибка сервера" });
    } finally {
        if (connection) await connection.end();
    }
});

// Запуск сервера
app.listen(port, () => {
    console.log(`API сервер запущен на порту ${port}`);
});