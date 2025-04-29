import mysql from 'mysql2/promise';

export const dbConnection = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'password',
    database: 'fileMetaData',
    waitForConnections: true, // Ensures the pool waits for a connection if all are busy
    connectionLimit: 10, // Limits the number of simultaneous connections
    queueLimit: 0 // Default is 0, meaning no limit on the number of queued connection requests
});

async function testConnection() {
    try {
        // Test if the connection is successful
        const [rows] = await dbConnection.execute('SELECT 1 + 1 AS result');
        console.log('✅ Connected to MySQL Database!');
        console.log(rows);
    } catch (err) {
        console.error('❌ MySQL connection failed:', err);
    }
}

// Test connection
testConnection();
