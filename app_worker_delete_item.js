"use strict"

import mysql from 'mysql2/promise';
import Logger from './logger.js';

const logger = new Logger("./data/delete_items.log");

const DB_CONFIG = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PAAWORD,
  database: process.env.DB_DATABASE
}

const getUserIdx = async (userIdx) => {
  // 1. Open the connection
  const connection = await mysql.createConnection(DB_CONFIG);

  try {
    const query = `SELECT idx FROM agt_idle_game_1_build.User WHERE idx = ${userIdx}`;

    const [rows] = await connection.execute(query);
    logger.log(JSON.stringify(rows));
  } catch (error) {
    logger.error(error);
  } finally {
    // 2. CRITICAL: Always close single connections manually
    connection.end();
  }
}


const execute = async (mailNo, title, momo, items) => {
  // 1. Open the connection
  const connection = await mysql.createConnection(DB_CONFIG);

  try {
    let row_user_idx = getUserIdx(Number(process.evn.START_USER_IDX));
    while(undefined != row_user_idx && 0 < user_idx) {
      const query = `SELECT FROM Item WHERE user_idx = AND cnt= 0 AND item_no > 1000 ORDER BY item_idx LIMIT 10`;
      logger.log(`# ${query}`);
      const rows = await connection.execute(query);
      if(!Array.isArray(rows)) {
        console.log(rows);
      } else {
        console.log(rows);
      }

      // const [rows] = await connection.execute(query, [mailNo, title, momo, items]);
      // console.log(rows);
    }



  } catch (error) {
    console.error(error);
  } finally {
    // 2. CRITICAL: Always close single connections manually
    connection.end();
  }
}



async function main() {
  logger.log(`Start delete items`)
  await execute()
}

main();
