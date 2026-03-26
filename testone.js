const { MongoClient } = require("mongodb");
// The uri string must be the connection string for the database (obtained on Atlas).
const uri = process.env.mongo_uri;
const client = new MongoClient(uri);
async function run() {
try {
const database = client.db('Cluster0');
const parts = database.collection('MyDBexample');
// Query for a part that has partID '12345'
const query = { partID: '12345' };
const part = await parts.findOne(query);
console.log(part);
} finally {
// Ensures that the client will close when you finish/error
await client.close();
}
}
run().catch(console.dir);