"use strict"

import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import Database from 'better-sqlite3';
import cron from 'node-cron';
import winston from 'winston';
import dotenv from "dotenv";
dotenv.config({});

const LOG_PATH = process.env.LOG_PATH;
const SQLITE_PATH = process.env.SQLITE_PATH;

const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
);

const fileFormat = winston.format.combine(
    winston.format.simple()
);

const loggerDebug = winston.createLogger({
  level: 'debug',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({format: consoleFormat}),
    new winston.transports.File({ filename: LOG_PATH, format: fileFormat }),
  ],
});

const loggerInfo = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({format: consoleFormat}),
    new winston.transports.File({ filename: LOG_PATH, format: fileFormat }),
  ],
});

const loggerError = winston.createLogger({
  level: 'error',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({format: consoleFormat}),
    new winston.transports.File({ filename: LOG_PATH, format: fileFormat }),
  ],
});

const getDatetime = () => {
  return (new Date()).toISOString();
}

const Logger = {
  log: (str) => {
    loggerDebug.log('debug', `[${getDatetime()}] ${str}`)
  },
  info: (str) => {
    loggerInfo.log('info', `[${getDatetime()}] ${str}`)
  },
  error: (str) => {
    loggerError.log('error', `[${getDatetime()}] ${str}`)
  },
}


fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });

const sqlite = new Database(SQLITE_PATH, { verbose: Logger.log });
sqlite.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS job_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    send_at TEXT NOT NULL,
    mail_data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const insertSendLog = (send_at, mail_data) => {
  try {
    const insert = sqlite.prepare(`INSERT INTO job_log(send_at, mail_data) VALUES (?, ?)`);
    const info = insert.run(send_at, mail_data);

    Logger.log(`changes: ${info.changes}`); // 영향을 받은 행 수 (1)
    Logger.log(`lastInsertRowid: ${info.lastInsertRowid}`); // 삽입된 데이터의 ID
    return info.lastInsertRowid;
  } catch (error) {
    Logger.error(`- insertSendLog, Error : ${error.message}`);
  }
};

const getSendLog = (send_at) => {
  return sqlite.prepare(`SELECT * FROM job_log WHERE send_at = ?`).get(send_at);
}


const loadTable = () => {
  const filePath = "./data/actionEventData.json";
  try {
    if (!fs.existsSync(filePath)) {
      Logger.error(`- loadTable, Data File not found : ${filePath}`);
      return [];
    }

    Logger.log(`- loadTable, Data File load : ${filePath}`);


    const jsonObj = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const mails = [];
    for (const obj of jsonObj) {
      if (obj.type === 10000) {
        if ( Array.isArray(obj.conditions) ) {
          for (const con of obj.conditions) {
            mails.push(con);
          }
        }
      }
    }
    Logger.log(`- loadTable, Data File load Complete! : ${filePath}`);
    return mails;
  } catch (err) {
    Logger.log(`- loadTable, Error loading data file : ${filePath}`, err);
    return [];
  }
}

export const postJson = (url, body, options = {}) => {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (target.protocol !== "http:") {
      reject(new Error("http:// URL만 지원합니다."));
      return;
    }

    Logger.log(`- postJson, url : ${url}`);

    const payload = JSON.stringify(body);
    const req = http.request(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(payload),
        ...options.headers,
      },
      timeout: options.timeout ?? 300_000,
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => {
        let data = responseBody;
        if (responseBody) {
          try {
            data = JSON.parse(responseBody);
          } catch {
            // JSON이 아닌 응답은 문자열 그대로 반환한다.
          }
        }

        const response = {
          statusCode: res.statusCode,
          headers: res.headers,
          data,
        };

        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(response);
          return;
        }

        const error = new Error(`HTTP POST 실패: ${res.statusCode}`);
        error.response = response;
        reject(error);
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("HTTP POST 요청 시간이 초과되었습니다."));
    });
    req.on("error", reject);
    req.end(payload);
  });
};


const sendMail = async (mail) => {
  Logger.log(`- sendMail, mail : ${JSON.stringify(mail)}, test:${process.env.TEST}`);
  const mailData = {
    "command_type": "SEND_MAIL",
    "ADMIN_EXECUTE_FIRST_KEY": process.env.ADMIN_EXECUTE_FIRST_KEY,
    "ADMIN_EXECUTE_SECOND_KEY": process.env.ADMIN_EXECUTE_SECOND_KEY,
    "ADMIN_EXECUTE_THIRD_KEY": process.env.ADMIN_EXECUTE_THIRD_KEY,
    "SEND_MAIL": {
      "target_type": "ALL",
      "user_idxs": [],
      "mail_no": mail.mail_no,
      "title": mail.title,
      "context": mail.context,
      "expire": mail.expire,
      "subject_text": mail.subject_text,
      "desc_text": mail.desc_text,
      "from_text": mail.from_text,
      "mail_items": mail.mail_items
    }
  }
  const url = process.env.GAME_SERVER_URL;
  await postJson(url, mailData);
}

const executeJob = async () => {
  Logger.log(`---------- executeJob Start ----------`);

  const mails = loadTable();

  const now = new Date();
  const today = `${now.toISOString().slice(0, 10)}`;
  const dt = new Date(`${now.toISOString().slice(0, 16)}:00.000Z`);
  Logger.log(`executeJob, now: ${now.toISOString()}`);
  Logger.log(`executeJob, dt : ${dt.toISOString()}`);
  Logger.log(`executeJob, today: ${today}`);

  // const 2026-09-03T01:45:04.470Z
  for (const mail of mails) {
    Logger.log(``);
    const begin_date = mail.begin_date;
    const end_date = mail.end_date;
    const send_time = mail.send_time.split(":");
    const send_hour_str = (1 === send_time[0].length) ? `0${send_time[0]}` : send_time[0];
    const send_minute_srt = (1 === send_time[1].length) ? `0${send_time[1]}` : send_time[1];

    if ( today < begin_date || end_date < today ) {
      Logger.log(`> SKIP: Date, today:${today}, begin_date:${begin_date}, end_date:${end_date}`);
      continue;
    }

    Logger.log(`> GO: Date, today:${today}, begin_date:${begin_date}, end_date:${end_date}`);

    const send_at = `${today}T${send_hour_str}:${send_minute_srt}:00.000Z`
    Logger.log(`send_at: ${send_at}`);
    const prevSendLog = getSendLog(send_at);
    if (undefined != prevSendLog) {
      Logger.log(`> SKIP: FOUND prevSendLog: ${prevSendLog.send_at}`);
      continue;
    }

    if (dt < new Date(send_at)) {
      Logger.log(`> SKIP: DateTime, now:${dt.toISOString()} < send_at:${new Date(send_at).toISOString()}`);
      continue;
    }
    Logger.log(`> GO: DateTome, now:${dt.toISOString()} > send_at:${new Date(send_at).toISOString()}`);

    insertSendLog(send_at, JSON.stringify(mail));
    await sendMail(mail);
  }
}

// executeJob()
// .then(() => {
//   Logger.log(`---------- executeJob JOB END ------------`);
// })
// .catch((err) => {
//   Logger.log(`---------- executeJob JOB ERROR: ${err}`);
// })

/*
# ┌────────────── second (optional)
# │ ┌──────────── minute
# │ │ ┌────────── hour
# │ │ │ ┌──────── day of month
# │ │ │ │ ┌────── month
# │ │ │ │ │ ┌──── day of week
# │ │ │ │ │ │
# * * * * * *
 */
cron.schedule('*/1 * * * *', () => {
  Logger.log(`Mail schedule`);
  executeJob().then(() => {
    Logger.log(`executeJob END`);
  }).catch((err) => {
    Logger.log(`executeJob ERROR: ${err}`);
  })
})
