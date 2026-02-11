const express = require('express')
const mongoose = require('mongoose')
require('dotenv').config({path: __dirname + '/.env'})
const cors = require('cors')

const app = express()

const http = require('http');
const Race = require('./models/Race')
const server = http.createServer(app)
const PORT = '8002'

const URL = process.env.DB

mongoose.connect(URL)

app.use(cors({
    origin : '*'
}))

app.use(express.json())

// Race.createIndex({ date: -1 })

mongoose.connection.model('Race').collection.createIndex({ "date": -1 })


server.listen(PORT, () => {
    console.log("Server is listening to ", PORT)
})