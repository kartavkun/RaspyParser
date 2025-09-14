# RaspyParser
Парсер расписаний студентов, преподавателей и аудиторий [Университетского колледжа ОГУ](https://uc.osu.ru)

---
## Установка на Debian

### Шаг 0: Создаём пользователя и входим от его лица
```bash
# Создаём юзера "parseruser"
adduser parseruser
# Даём права суперпользователя
usermod -aG sudo parseruser
# Входим от лица пользователя
su - parseruser
```
Задаём пароль для пользователя

### Шаг 1: Подготовка сервера и установка зависимостей

Эти команды устанавливают все необходимое программное обеспечение: систему контроля версий `git`, среду выполнения `Node.js` (через `nvm` для удобства управления версиями) и сервер базы данных `MySQL`.

#### 1.1. Обновление системы
```bash
sudo apt update && sudo apt upgrade -y && sudo apt install git chromium-chromedriver mysql-server -y
```

#### 1.2 Скачиваем и запускаем установочный скрипт nvm
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
```

# Устанавливаем и используем последнюю стабильную версию Node.js
```bash
nvm install --lts
nvm use --lts

# Проверяем версии
node -v
npm -v
```

#### 1.4 Настройка MySQL  Server
```bash
sudo mysql_secure_installation
```

Пишем везде Y, а пароль можете оставить на 0

#### 1.5 Создание БД

Скопируйте польностью всю команду и вставьте
```bash
# Создаем файл
cat <<EOF > schema.sql
CREATE DATABASE IF NOT EXISTS schedule_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE schedule_db;

CREATE TABLE IF NOT EXISTS `groups` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `group_name` VARCHAR(100) NOT NULL UNIQUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `teachers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `teacher_name` VARCHAR(255) NOT NULL UNIQUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `schedule` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `group_id` INT NOT NULL,
    `schedule_date` DATE NOT NULL,
    `lesson_number` VARCHAR(50) NOT NULL,
    `subject` VARCHAR(255),
    `room` VARCHAR(100),
    `teacher` VARCHAR(255),
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `last_updated` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_lesson` (`group_id`, `schedule_date`, `lesson_number`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `teacher_schedule` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `teacher_id` INT NOT NULL,
    `schedule_date` DATE NOT NULL,
    `lesson_number` VARCHAR(50) NOT NULL,
    `subject` VARCHAR(255),
    `room` VARCHAR(100),
    `group` VARCHAR(100),
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `last_updated` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON DELETE CASCADE,
    UNIQUE KEY `unique_teacher_lesson` (`teacher_id`, `schedule_date`, `lesson_number`)
) ENGINE=InnoDB;
EOF
```

##### Входим в MySQL
```bash
sudo mysql -u root -p
```
##### Создаем пользователя
```mysql
CREATE USER 'api_user'@'localhost' IDENTIFIED BY 'СЕКРЕТНЫЙ_ПАРОЛЬ';
```
##### Даем ему все права на нашу базу данных
```mysql
GRANT ALL PRIVILEGES ON schedule_db.* TO 'api_user'@'localhost';
```
##### Применяем изменения
```mysql
FLUSH PRIVILEGES;
```
##### Выходим
```mysql
EXIT;
```

### 1.6 Установка парсера
#### Клонирование проекта
```bash
git clone https://github.com/MaddoDev/RaspyParser
cd RaspyParser
```

#### Установка зависимостей
```bash
npm install selenium-webdriver cheerio mysql2 moment express
```

Откройте файлы `Parser.js` и `RestAPI.js` и измените юзер и пароль, который вы придумали в шаге 1.5
```javascript
const dbConfig = {
    host: 'localhost',
    user: 'ПОЛЬЗОВАТЕЛЬ',
    password: 'СЕКРЕТНЫЙ_ПАРОЛЬ',  
    database: 'schedule_db'
};
```

### Шаг 2: Запуск парсера
Запускаем парсер с помощью следующей команды:
```bash
node Parser.js
```

### Шаг 3: Запуск API
Запускаем API с помощью следующей команды:
```bash
node RestAPI.js
```

## Как пользоваться API?
АПИ предоставляет данные о расписании в формате JSON. Для запросов используется GET метод.

### Эндпоинты
#### Списки
- /groups
- /teachers
- /rooms

#### Получение расписания
- /schedule/group?group={название_группы} (использует нынешнюю неделю)
- schedule/teacher?teacher_name={Фамилия И.О.}&date={ГГГГ-ММ-ДД}
- /schedule/room?room={номер_аудитории} (использует сегодняшнюю дату)

Пример запроса:
```bash
curl -X GET http://{ip}:3000/groups
```
Ответ:
```json
[{"type":"group","name":"21МТОР-1"},{"type":"group","name":"21МТОР-2"},{"type":"group","name":"21ТМП-1"},{"type":"group","name":"22ИСП-1"},{"type":"group","name":"22ИСП-2"},{"type":"group","name":"22ИСП-3"},{"type":"group","name":"22КСК-1"},{"type":"group","name":"22КСК-2"},{"type":"group","name":"22КСК-3"},{"type":"group","name":"22МТОР-1"},{"type":"group","name":"22МТОР-2"},{"type":"group","name":"22МЭГ-1"},{"type":"group","name":"22ОИБ-1"},{"type":"group","name":"22ОИБ-2"},{"type":"group","name":"22ОИБ-3"},{"type":"group","name":"22ОСАТП-1"},{"type":"group","name":"22ОСАТП-2"},{"type":"group","name":"22ПЛ-1"},{"type":"group","name":"22ПЛ-2"},{"type":"group","name":"22ССА-1"},{"type":"group","name":"22ССА-2"},{"type":"group","name":"22ТМ-1"},{"type":"group","name":"22ТМП-1"},{"type":"group","name":"22ТОРРТ-1"},{"type":"group","name":"22ТОРРТ-2"},{"type":"group","name":"22ТОРРТ-3"},{"type":"group","name":"22Э-1"},{"type":"group","name":"22Э-2"},{"type":"group","name":"23БД-1"},{"type":"group","name":"23З-1"},{"type":"group","name":"23З-2"},{"type":"group","name":"23З(с)-3"},{"type":"group","name":"23ИСП-1"},{"type":"group","name":"23ИСП-2"},{"type":"group","name":"23ИСП-3"},{"type":"group","name":"23КСК-1"},{"type":"group","name":"23КСК-2"},{"type":"group","name":"23КСК-3"},{"type":"group","name":"23КСК-4"},{"type":"group","name":"23МТОР-1"},{"type":"group","name":"23МТОР-2"},{"type":"group","name":"23МЭГ-1"},{"type":"group","name":"23ОИБ-1"},{"type":"group","name":"23ОИБ-2"},{"type":"group","name":"23ОИБ-3"},{"type":"group","name":"23ОСАТП-1"},{"type":"group","name":"23ОСАТП-2"},{"type":"group","name":"23ПЛ-1"},{"type":"group","name":"23ПЛ-2"},{"type":"group","name":"23ПСО-1"},{"type":"group","name":"23ПСО-2"},{"type":"group","name":"23ПСО-3"},{"type":"group","name":"23ПСО-4"},{"type":"group","name":"23РЭУС-1"},{"type":"group","name":"23РЭУС-2"},{"type":"group","name":"23РЭУС-3"},{"type":"group","name":"23ССА-1"},{"type":"group","name":"23ССА-2"},{"type":"group","name":"23ТМ-1"},{"type":"group","name":"23ТМ-2"},{"type":"group","name":"23Э-1"},{"type":"group","name":"23Э-2"},{"type":"group","name":"23Э-3"},{"type":"group","name":"23Э-4"},{"type":"group","name":"23ЭБУ-1"},{"type":"group","name":"24БД-1"},{"type":"group","name":"24З-1"},{"type":"group","name":"24З-2"},{"type":"group","name":"24ИСП-1"},{"type":"group","name":"24ИСП-2"},{"type":"group","name":"24ИСП-3"},{"type":"group","name":"24КСК-1"},{"type":"group","name":"24КСК-2"},{"type":"group","name":"24КСК-3"},{"type":"group","name":"24МТОР-1"},{"type":"group","name":"24МТОР-2"},{"type":"group","name":"24МЭГ-1"},{"type":"group","name":"24ОИБ-1"},{"type":"group","name":"24ОИБ-2"},{"type":"group","name":"24ОИБ-3"},{"type":"group","name":"24ОСАТП-1"},{"type":"group","name":"24ОСАТП-2"},{"type":"group","name":"24ПЛ-1"},{"type":"group","name":"24ПЛ-2"},{"type":"group","name":"24РЭУС-1"},{"type":"group","name":"24РЭУС-2"},{"type":"group","name":"24ССА-1"},{"type":"group","name":"24ССА-2"},{"type":"group","name":"24ТМ-1"},{"type":"group","name":"24ТМ-2"},{"type":"group","name":"24ТППЖ-1"},{"type":"group","name":"24ТППР-1"},{"type":"group","name":"24Э-1"},{"type":"group","name":"24Э-2"},{"type":"group","name":"24Э-3"},{"type":"group","name":"24ЭБУ-1"},{"type":"group","name":"24ЮР-1"},{"type":"group","name":"24ЮР-2"},{"type":"group","name":"24ЮР-3"},{"type":"group","name":"24ЮР-4"},{"type":"group","name":"24ЮР-5(с)"},{"type":"group","name":"24ЮР-6(с)"},{"type":"group","name":"25БД-1"},{"type":"group","name":"25З-1"},{"type":"group","name":"25З-2"},{"type":"group","name":"25ИМС"},{"type":"group","name":"25ИСП-1"},{"type":"group","name":"25ИСП-2"},{"type":"group","name":"25ИСП-3"},{"type":"group","name":"25ИСП-4"},{"type":"group","name":"25КСК-1"},{"type":"group","name":"25КСК-2"},{"type":"group","name":"25МТОР-1"},{"type":"group","name":"25МТОР-2"},{"type":"group","name":"25МЭГ-1"},{"type":"group","name":"25ОИБ-1"},{"type":"group","name":"25ОИБ-2"},{"type":"group","name":"25ОИБ-3"},{"type":"group","name":"25ПЛ-1"},{"type":"group","name":"25ПЛ-2"},{"type":"group","name":"25РЭУС-1"},{"type":"group","name":"25РЭУС-2"},{"type":"group","name":"25ССА-1"},{"type":"group","name":"25ССА-2"},{"type":"group","name":"25ТМ-1"},{"type":"group","name":"25ТМ-2"},{"type":"group","name":"25ТППЖ-1"},{"type":"group","name":"25ТППР-1"},{"type":"group","name":"25ТЭОРП-1"},{"type":"group","name":"25ТЭОРП-2"},{"type":"group","name":"25Э-1"},{"type":"group","name":"25Э-2"},{"type":"group","name":"25Э-3"},{"type":"group","name":"25ЭБУ-1"},{"type":"group","name":"25ЮР-1"},{"type":"group","name":"25ЮР-2"},{"type":"group","name":"25ЮР-3"},{"type":"group","name":"25ЮР-4"},{"type":"group","name":"25ЮР-5(с)"},{"type":"group","name":"25ЮР-6(с)"},{"type":"group","name":"З-21КСК-2(0)"},{"type":"group","name":"З-21ПД-2(0)"},{"type":"group","name":"З-21ТОРРТ-2(0)"},{"type":"group","name":"З-21Э-2(0)"},{"type":"group","name":"З-21ЭБУ-1"},{"type":"group","name":"З-22КСК-1"},{"type":"group","name":"З-22ПД-1"},{"type":"group","name":"З-22ПД-2(0)"},{"type":"group","name":"З-22ТОРРТ-1"},{"type":"group","name":"З-22Э-1"},{"type":"group","name":"З-22Э-2(0)"},{"type":"group","name":"З-22ЭБУ-2(0)"},{"type":"group","name":"З-23ПД-1"},{"type":"group","name":"З-23ПД-2 (о)"},{"type":"group","name":"З-23ПД-2(о)"},{"type":"group","name":"З-23Э-1"},{"type":"group","name":"З-23Э-2(0)"},{"type":"group","name":"З-23ЭБУ-1"},{"type":"group","name":"З-23ЭБУ-2(0)"},{"type":"group","name":"З-24ПД-1"},{"type":"group","name":"З-24Э-1"},{"type":"group","name":"З-24Э-2(о)"},{"type":"group","name":"З-24ЭБУ-1"},{"type":"group","name":"З-24ЭБУ-2(о)"},{"type":"group","name":"З-24ЮР-1"},{"type":"group","name":"З-24ЮР-2(о)"},{"type":"group","name":"З-25Э-2(0)"},{"type":"group","name":"З-25ЭБУ-1(0)"},{"type":"group","name":"З-25ЭБУ-2(0)"},{"type":"group","name":"З-25ЮР-1(0)"}]
```

## Проблемы
### Если вы используюте Ubuntu, то необходимо устанавливать пакеты chromium-chromedriver и chrome через .deb файлы вместо пакетного менеджера из-за snap-пакетов.
```bash
#!/usr/bin/env bash
set -e

# Папка для временных файлов
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

echo "Скачиваем Google Chrome..."
wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb -O google-chrome.deb

echo "Устанавливаем зависимости для Chrome..."
sudo apt update
sudo apt install -y wget unzip fonts-liberation libasound2 libatk-bridge2.0-0 \
libatk1.0-0 libatspi2.0-0 libcairo2 libcups2 libgbm1 libgtk-3-0 libpango-1.0-0 \
libvulkan1 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 xdg-utils

echo "Устанавливаем Google Chrome..."
sudo dpkg -i google-chrome.deb || sudo apt install -f -y

# Получаем установленную версию Chrome
CHROME_VERSION=$(google-chrome --version | grep -oP '\d+\.\d+\.\d+\.\d+')
echo "Установленная версия Chrome: $CHROME_VERSION"

# Скачиваем ChromeDriver соответствующей версии
echo "Скачиваем соответствующий ChromeDriver..."
wget -q "https://storage.googleapis.com/chrome-for-testing-public/$CHROME_VERSION/linux64/chromedriver-linux64.zip" -O chromedriver.zip

echo "Распаковываем ChromeDriver..."
unzip -q chromedriver.zip
chmod +x chromedriver

# Перемещаем в системный путь
sudo mv chromedriver /usr/local/bin/

echo "Очистка временных файлов..."
cd ~
rm -rf "$TMP_DIR"

echo "Установка завершена!"
google-chrome --version
chromedriver --version
```
