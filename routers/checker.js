const express = require('express')
const axios = require('axios')
const meetings = require('./meetings.json')
const all_races = require('./index.json')
const today_races = require('./today_races.json')
const fs = require("fs");
const OpenAI = require('openai')
const next_race_file = require('./next_race.json');
const Race = require('../models/Race');


router.get('/bet/ai', async (req, res) => {
    try {

        // const file = await client.files.create({
        //     file: fs.createReadStream("./routers/races.txt"),
        //     purpose: "assistants"
        // });

        // console.log(file)

        // const file = {
        //     object: 'file',
        //     id: 'file-MtxomuXkbqmZ7e9sf89eL2',
        //     purpose: 'assistants',
        //     filename: 'index.json',
        //     bytes: 899023,
        //     created_at: 1770488425,
        //     expires_at: null,
        //     status: 'processed',
        //     status_details: null
        // }

        // const input = [
        //     {
        //         "role": "user",
        //         "content": [
        //             {
        //                 "type": "input_file",
        //                 "file_id": file.id
        //             },
        //             {
        //                 "type": "input_text",
        //                 "text": JSON.stringify(next_race_file)
        //             }
        //         ]
        //     }
        // ]

        console.log(all_races.length)

        
        const response = await client.responses.create({
            model: 'gpt-5-mini',
            // tools: [{
            //     container: { type: "auto" },
            //     type: "code_interpreter"
            // }],
            instructions: instructions,
            // input : JSON.stringify(next_race_file),
            input: JSON.stringify(next_race_file)
        });

        console.log(response.output_text);

        res.status(200).send(response.output_text)

    } catch (error) {
        console.log(error.message)
        res.status(500).send()
    }
})

module.exports = router