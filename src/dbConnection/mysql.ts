import mysql from 'mysql2/promise';

export const dbConnection = mysql.createPool({
    host: process.env.MYSQL_HOST as string,
    user: process.env.MYSQL_USER as string,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function testConnection() {
    try {
        // Test if the connection is successful
        const rows = await dbConnection.execute('SELECT 1 + 1 AS result');
        console.log('✅ Connected to MySQL Database!');
        console.log(rows);
    } catch (err) {
        console.error('❌ MySQL connection failed:', err);
    }
}

// Test connection
testConnection();
