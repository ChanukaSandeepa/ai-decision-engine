const mongoose = require('mongoose')

const schema = new mongoose.Schema({
    id : String,
    catetory : String,
    venue : String,
    fingerprint : String,
    eventDateTime : String,
    eventCode : String,
    embedding : []
})

const Race = mongoose.model('Race', schema)

module.exports = Race