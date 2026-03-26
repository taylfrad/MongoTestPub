const { MongoClient } = require("mongodb");
require('dotenv').config();

const uri = process.env.mongo_uri;

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected to MongoDB!");

    const database = client.db('MyDBexample');
    const collection = database.collection('MyStuff');

    const result = await collection.findOne({ part: "Drill" });
    console.log("Found:", result);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

main();