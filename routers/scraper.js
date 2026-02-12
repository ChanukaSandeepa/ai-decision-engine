const express = require('express')
const axios = require('axios')
const meetings = require('./meetings.json')
const all_races = require('./index.json')
const today_races = require('./today_races.json')
const fs = require("fs");
const OpenAI = require('openai')
const next_race_file = require('./next_race.json');
const Race = require('../models/Race');

const router = express.Router()

// open ai api key
const openAi = process.env.openAi


const client = new OpenAI({
  apiKey: openAi // This is the default and can be omitted
});

const instructions = `You are an expert horse race data analyst AI to predict the winner.

            Rules:
            - Use JSON data provided in the input as the next race
            - Do NOT assume or invent missing data.
            - Focus on statistical patterns and trends.
            - Be concise and objective.
            - Do not include explanations about being an AI.
            - If you find any winning pattern in the past data, you must follow it but very carefully
            - You should act like what you'll do if you bet on this race

            Output Style:
            - Structured and clear.
            - Prefer bullet points.
            - No long paragraphs.`


router.get('/bet/scrape', async (req, res) => {
    try {
        const localDate = 'Feb 9'
        const raceDate = 'Feb 9'

        const next_race = await findNextRace(localDate, raceDate)

        res.status(200).json(next_race)
    } catch (error) {
        console.log(error)
        res.status(500).send()
    }
})


router.get('/bet/update', async (req, res) => {
    try {
        const date_to_search = '2026-02-12'

        const localDate = 'Feb 12'
        const raceDate = 'Feb 12'

        const url = `https://www.stbet.com/stbetrest/services/online/meeting/allevents?eventDate=${date_to_search}&category=HR`

        const user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"


        const respose = await axios.get(url, {
            headers : {
                "User-Agent" : user_agent
            }
        })

        const data = respose.data

        const races = []

        const full_race_data = []

        console.log(data.length)

        data.map((evt) => {
            if(evt.meetingName === 'Portman Park' || evt.meetingName === 'Steepledowns' || evt.meetingName === 'SprintValley'){
                races.push(evt)
            }
        })

        for (let index = 0; index < races.length; index++) {
            const race = races[index];

            const found = all_races.find((f) => f.id === race.id)
            
            if(!found){
                const winning_url = 'https://www.stbet.com/stbetrest/services/online/meeting/eventResultsByEventId?eventId=' + race.id
                const runners_url = 'https://www.stbet.com/stbetrest/services/online/meeting/eventResultsBySelection?eventId=' + race.id

                const winning_respose = await axios.get(winning_url, {
                    headers : {
                        "User-Agent" : user_agent
                    }
                })

                const runners_respose = await axios.get(runners_url, {
                    headers : {
                        "User-Agent" : user_agent
                    }
                })
                                    
                full_race_data.push({
                    ...race,
                    winners : winning_respose.data[0],
                    runners : runners_respose.data
                })
            } else {
                full_race_data.push(found)
            }
        }

        
        console.log("Fetch from web is completed and now saving DB")


        const ids = full_race_data.map((f) => f.id)

        const saved_races = await Race.find({id : ids})

        const unsaved_races = []

        full_race_data.map((r) => {
            const found = saved_races.find((rd) => r.id.toString() === rd.id)
            if(!found){
                unsaved_races.push(r)
            }
        })

        console.log('Unsaved races : ',unsaved_races.length)

        for (let index = 0; index < unsaved_races.length; index++) {
            const race = unsaved_races[index];
            const print = buildFingerprint(race)

            if(race.runners === undefined){
                console.log(race.id)
            }

            const emb = await client.embeddings.create({
                model: "text-embedding-3-small",
                input: print.fingerprint
            });

            const embedding = emb.data[0].embedding

            const obj = {
                ...print,
                embedding
            }

            const rc = new Race(obj)
            rc.save().then((result) => {}).catch((error) => {
                console.log(error)
            })
            
        }

        let cateCon = JSON.stringify(full_race_data);
        fs.writeFile(
            __dirname + "/index.json",
            cateCon,
            "utf8",
            function (err) {
                if (err) {
                    console.log("An error occured while writing JSON Object to File.");
                    return console.log(err);
                }
            }
        );

        

        const next_race = await findNextRace(localDate, raceDate)

        console.log(races.length)
        console.log(full_race_data.length)

        res.status(200).json(next_race)

    } catch (error) {
        console.log(error)
        res.status(500).send()
    }
})

router.get('/bet/emb', async (req, res) => {
    try {

        const ids = all_races.map((f) => f.id)

        const saved_races = await Race.find({id : ids})

        const unsaved_races = []

        all_races.map((r) => {
            const found = saved_races.find((rd) => r.id.toString() === rd.id)
            if(!found){
                unsaved_races.push(r)
            }
        })

        console.log(unsaved_races.length)

        for (let index = 0; index < all_races.length; index++) {
            const race = all_races[index];
            const print = buildFingerprint(race)

            const emb = await client.embeddings.create({
                model: "text-embedding-3-small",
                input: print.fingerprint
            });

            const embedding = emb.data[0].embedding

            const obj = {
                ...print,
                embedding
            }

            const rc = new Race(obj)
            rc.save().then((result) => {}).catch((error) => {
                console.log(error)
            })
            
        }
        res.status(200).send()
    } catch (error) {
        console.log(error)
        res.status(500).send()
    }
})

router.get('/bet/next', async (req, res) => {
    try {
        const fingerprint = buildFingerprintForNextRace(next_race_file)



        const emb = await client.embeddings.create({
            model: "text-embedding-3-small",
            input: fingerprint
        });

        const embedding = emb.data[0].embedding

        const result = await Race.aggregate([
            {
                "$vectorSearch": {
                "index": "vector_index",
                "path": "embedding",
                "queryVector": embedding,
                "numCandidates": 400,
                "limit": 15
                }
            }
        ])

        // const result = []

        const race_count = await Race.count({venue : next_race_file.meetingName})

        const recent_races = await Race.find({venue : next_race_file.meetingName}).skip(race_count - 10).limit(10)

        console.log(recent_races[0].id, race_count)

        const runners = next_race_file.runners.filter((f) => !isNaN(f.priceOdds.priceDecimal))

        const prompt = buildPrompt(fingerprint, runners, result.map((f) => f.fingerprint), recent_races.map((f) => f.fingerprint))

        const promptinstruction_v1 = `You are a Virtual Horse Race Risk Analyzer and Strategy Engine.

Your responsibilities are:

1. Analyze the NEXT RACE using:
   - Similar historical races retrieved from database.
   - The most recent races from the SAME VENUE.
   - Odds structure and runner distribution.

2. Detect whether a WINNING SEQUENCE or PATTERN exists in the recent venue races.
   - Look for repeated winner rank trends, favorite streaks, or upset streaks.
   - If no clear pattern exists, state "NO CLEAR SEQUENCE".

3. Classify the race type into ONE of the following categories:

   A) FAVORITE DOMINANT
      - Historical favorite win rate is high.
      - Recent venue races show favorites frequently winning or placing.
      - Odds spread is narrow and favorite odds are strong.

   B) BALANCED
      - Winners are distributed among rank 1–5.
      - No strong streak pattern.
      - Mid-range runners frequently appear in top 3.

   C) UPSET PRONE
      - Historical winners often come from mid or long odds.
      - Recent venue races show high randomness or longshot wins.
      - Odds spread is wide and favorite strength is weak.

4. Betting Decision Rules:
   - Recommend SKIP only if randomness is extremely high AND no pattern exists.
   - Otherwise recommend BET.

5. Selection Rules Based on Race Type:

   IF FAVORITE DOMINANT:
     - Suggest ONLY 2 runners.
     - Both may be from top favorites.

   IF BALANCED:
     - Suggest 3 runners.
     - Include a mix of favorite + mid-range runners.

   IF UPSET PRONE:
     - Suggest ONLY 2 runners.
     - DO NOT include the lowest-odds favorite.
     - Focus on mid-range or longshot value picks.

6. Do NOT automatically choose the lowest odds.
   Use venue trends, rank distributions, and similarity data before deciding.

7. Diversify selections if multiple runners have similar probability.

8. Provide a Confidence Score from 0–100 based on:
   - Pattern strength
   - Historical similarity
   - Odds stability

9. Output STRICTLY in JSON format:

{
  "decision": "BET" or "SKIP",
  "raceType": "FAVORITE_DOMINANT | BALANCED | UPSET_PRONE",
  "confidence": number,
  "sequenceAnalysis": "short explanation",
  "suggestedRunnersFromRecentRaces": [],//both name and odds should appear like: #3 MORRIS MINOR - 6.5
  "suggestedRunnersSimilarRaces": [],//both name and odds should appear like: #3 MORRIS MINOR - 6.5
  "finalRunners": [],//both name and odds should appear like: #3 MORRIS MINOR - 6.5
  "all_runners": [],//both name and odds should appear like: #3 MORRIS MINOR - 6.5 -> Lowest should be placed in the top of result
  "reasoning": "brief reasoning"
}

Important Constraints:
- Never return more runners than allowed by race type.
- Never include favorite in UPSET_PRONE unless absolutely unavoidable.
- Prefer historical evidence over pure odds.
- If no strong evidence exists, lower confidence instead of guessing.
`


        const promptInstructions = `You are a Virtual Horse Race Risk Analyzer and Strategy Engine.

Your responsibilities are:

1. Analyze the NEXT RACE using:
   - Similar historical races retrieved from database.
   - The most recent 10 races from the SAME VENUE.
   - Odds structure and runner distribution.

2. Detect whether a WINNING SEQUENCE or PATTERN exists in the recent venue races.
   - Look for repeated winner rank trends, favorite streaks, or upset streaks.
   - If no clear pattern exists, state "NO CLEAR SEQUENCE".

3. Classify the race type into ONE of the following categories:

   A) FAVORITE DOMINANT
      - Historical favorite win rate is high.
      - Recent venue races show favorites frequently winning or placing.
      - Odds spread is narrow and favorite odds are strong.

   B) BALANCED
      - Winners are distributed among rank 1–5.
      - No strong streak pattern.
      - Mid-range runners frequently appear in top 3.

   C) UPSET PRONE
      - Historical winners often come from mid or long odds.
      - Recent venue races show high randomness or longshot wins.
      - Odds spread is wide and favorite strength is weak.

4. Betting Decision Rules:
   - Recommend SKIP only if randomness is extremely high AND no pattern exists.
   - Otherwise recommend BET.

5. Selection Rules Based on Race Type (Considering Two-Runner Coverage Strategy):

   IF FAVORITE DOMINANT:
     - Suggest ONLY 2 runners.
     - Prefer 1 strong favorite + 1 stable mid-favorite instead of two nearly identical odds.
     - Focus on high place probability.

   IF BALANCED:
     - Suggest 3 runners.
     - Include a mix of favorite + mid-range runners.
     - Ensure at least two runners provide strong place coverage.

   IF UPSET PRONE:
     - Suggest ONLY 2 runners.
     - DO NOT include the lowest-odds favorite unless absolutely unavoidable.
     - Avoid pairing two extreme longshots together.
     - Focus on mid-range or longshot value picks with place consistency.

6. Do NOT automatically choose the lowest odds.
   Use venue trends, rank distributions, and similarity data before deciding.

7. Diversify selections if multiple runners have similar probability.

8. Provide a Confidence Score from 0–100 based on:
   - Pattern strength
   - Historical similarity
   - Odds stability

9. User Betting Strategy Awareness (CRITICAL):
   - The user always bets on TWO runners per race, placing both WIN and PLACE bets with equal stake amounts.
   - The primary objective is capital preservation and reduced loss risk, not aggressive jackpot wins.
   - Prioritize coverage probability and place consistency over pure win probability.
   - Avoid selecting two high-risk longshots together unless strong historical or venue evidence supports it.
   - Prefer combinations such as:
       • 1 safer probability runner + 1 value runner
       • 2 mid-range stable runners
   - The two selections must complement each other and reduce the likelihood of a total loss.
   - Place probability, consistency, and historical reliability are as important as win odds.

10. Output STRICTLY in JSON format:

{
  "decision": "BET" or "SKIP",
  "raceType": "FAVORITE_DOMINANT | BALANCED | UPSET_PRONE",
  "confidence": number,
  "sequenceAnalysis": "short explanation",
  "suggestedRunners": [selectionNumbers],//both name and odds should appear like: #3 MORRIS MINOR - 6.5
  "all_runners": [],//both name and odds should appear with the rank like:  Rank 1 : #3 MORRIS MINOR - 6.5
  "reasoning": "brief reasoning"
}

Important Constraints:
- Never return more runners than allowed by race type.
- Never include favorite in UPSET_PRONE unless absolutely unavoidable.
- Prefer historical evidence over pure odds.
- If no strong evidence exists, lower confidence instead of guessing.
- Selections must consider the dual WIN + PLACE equal-stake strategy and aim to minimize total loss risk.
- Avoid duplicate-risk pairings (two extreme longshots together).`

        const ress = await client.chat.completions.create({
            model: "gpt-5.2",
            messages: [
                // { role: "system", content: promptInstructions },
                { role: "system", content: promptinstruction_v1 },
                { role: "user", content: prompt }
            ],
            temperature: 0.3
        });

        const message = ress.choices[0].message.content

        console.log(ress)

        // const response = await client.responses.create({
        //     model: 'gpt-5.2',
        //     instructions: promptinstruction_v1,
        //     input: prompt,
        // });

        res.status(200).json(JSON.parse(message))
        // res.status(200).json(response.output_text)
    } catch (error) {
        console.log(error)
        res.status(500).send()
    }
})

router.get('/bet/delete/duplicates', async (req, res) => {
    try {
        const duplicates = await Race.aggregate([
            {
                $group: {
                    _id: "$id",
                    ids: { $push: "$_id" },
                    count: { $sum: 1 }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            }
        ]);

        for (const doc of duplicates) {
            doc.ids.shift(); // keep one
            console.log(doc.ids)
            // await Race.deleteMany({ _id: { $in: doc.ids } });
        }

        res.status(200).send()

    } catch (error) {
        console.log(error)
        res.status(500).send()
    }
})

function buildPrompt(nextRace, runners, pastRaces, recent_races) {
  return `
UPCOMING RACE FINGERPRINT

${nextRace.split(/\r?\n/).filter(line => line.trim().length > 0).join('\n')}

UPCOMING RUNNERS:

${runners.map((r,i)=>
`${i+1}. ${r.name} – ${r.priceOdds.priceDecimal}`
).join("\n")}

SIMILAR PAST RACES
${pastRaces.map((r,i)=>`
Race ${i+1}:-

${r.split(/\r?\n/).filter(line => line.trim().length > 0).join('\n')}
`).join("\n")}


RECENT PAST RACES
${recent_races.map((r,i)=>`
Race ${i+1}:-

${r.split(/\r?\n/).filter(line => line.trim().length > 0).join('\n')}
`).join("\n")}

TASK
Predict the finishing order for the NEXT RACE.
`;
}


function minuteBucket(min) {
  return Math.floor(min / 5) * 5; // 0,5,10,15...
}

function median(arr) {
  if (!arr.length) return 0;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2
    ? arr[mid]
    : (arr[mid - 1] + arr[mid]) / 2;
}

function buildFingerprint(race) {
  const runners = race.runners || [];

    const odds = runners
    .map(r => Number(r.lastOddDec))
    .filter(o => !isNaN(o))
    .sort((a, b) => a - b);

    // const odds = runners
    // .map(r => Number(r.priceOdds.priceDecimal))
    // .filter(o => !isNaN(o))
    // .sort((a, b) => a - b);

  const count = odds.length;

  const fav = odds[0] || 0;
  const second = odds[1] || 0;
  const third = odds[2] || 0;
  const longest = odds[count - 1] || 0;

  const avg = odds.reduce((a, b) => a + b, 0) / (count || 1);
  const med = median(odds);

  const spread = longest - fav;
  const favGap = second - fav;
  const secondGap = third - second;

  const strongFavs = odds.filter(o => o < 3).length;
  const midRange = odds.filter(o => o >= 3 && o <= 10).length;
  const longshots = odds.filter(o => o > 10).length;

  const favStrength = fav / (avg || 1);

  // time normalization
  const date = new Date(race.winners?.eventTimeUTC || Date.now());
  const hour = date.getUTCHours();
  const minute = minuteBucket(date.getUTCMinutes());
  const day = date.toLocaleDateString("en-US", { weekday: "long" });

  // winner
  const winner = race.winners?.eventPositions?.find(
    p => p.resultPosition === 1
  );

  let winnerOdds = 0;
  let winnerPlace = 0;
  let winnerRank = 0;

  if (winner) {
    winnerOdds = Number(winner.winAmount);
    winnerPlace = Number(winner.placeAmount);
    winnerRank = odds.indexOf(winnerOdds) + 1;
  }

  const upset = winnerRank > 3;

  const top3 = race.winners?.eventPositions
    ?.slice(0, 3)
    .map(w => {
      const o = Number(w.winAmount || w.lastOddDec);
      return odds.indexOf(o) + 1;
    })
    .join(",");

    const fingerprint =  `
Category: Virtual Horse Race
Venue: ${race.meetingName}
Event Type: ${race.eventName}
Runner Count: ${count}

Race Hour: ${hour}
Race Minute Bucket: ${minute}
Day Of Week: ${day}

Odds Sorted: [${odds.join(",")}]
Favorite Odds: ${fav}
Second Favorite Odds: ${second}
Third Favorite Odds: ${third}
Longest Odds: ${longest}

Average Odds: ${avg.toFixed(2)}
Median Odds: ${med.toFixed(2)}
Odds Spread: ${spread.toFixed(2)}
Favorite Gap: ${favGap.toFixed(2)}
Second Gap: ${secondGap.toFixed(2)}

Strong Favorites (<3): ${strongFavs}
Mid Range Runners (3–10): ${midRange}
Longshots (>10): ${longshots}

Favorite Strength Ratio: ${favStrength.toFixed(2)}

Winner Rank By Odds: ${winnerRank}
Winner Win Odds: ${winnerOdds}
Winner Place Odds: ${winnerPlace}
Winner Is Upset: ${upset}
Top3 Winner Ranks: [${top3}]
`.trim();

    const obj = {
        catetory : "Virtual Horse Racing",
        venue :race.meetingName,
        fingerprint : fingerprint,
        eventDateTime : race.eventDateTime,
        eventCode : race.eventCode,
        id : race.id
    }

  return obj
}

function buildFingerprintForNextRace(race) {
  const runners = race.runners || [];


    const odds = runners
    .map(r => Number(r.priceOdds.priceDecimal))
    .filter(o => !isNaN(o))
    .sort((a, b) => a - b);

  const count = odds.length;

  const fav = odds[0] || 0;
  const second = odds[1] || 0;
  const third = odds[2] || 0;
  const longest = odds[count - 1] || 0;

  const avg = odds.reduce((a, b) => a + b, 0) / (count || 1);
  const med = median(odds);

  const spread = longest - fav;
  const favGap = second - fav;
  const secondGap = third - second;

  const strongFavs = odds.filter(o => o < 3).length;
  const midRange = odds.filter(o => o >= 3 && o <= 10).length;
  const longshots = odds.filter(o => o > 10).length;

  const favStrength = fav / (avg || 1);


  const df = race.eventCode.split(':')

  // time normalization
  const date = new Date(Date.now());
  const hour = df[0]
  const minute = minuteBucket(df[1])
  const day = date.toLocaleDateString("en-US", { weekday: "long" });

//   Venue: ${race.meetingName}

    const fingerprint =  `
Category: Virtual Horse Race
Event Type: ${race.eventName}
Venue: ${race.meetingName}
Runner Count: ${count}

Race Hour: ${hour}
Race Minute Bucket: ${minute}
Day Of Week: ${day}

Odds Sorted: [${odds.join(",")}]
Favorite Odds: ${fav}
Second Favorite Odds: ${second}
Third Favorite Odds: ${third}
Longest Odds: ${longest}

Average Odds: ${avg.toFixed(2)}
Median Odds: ${med.toFixed(2)}
Odds Spread: ${spread.toFixed(2)}
Favorite Gap: ${favGap.toFixed(2)}
Second Gap: ${secondGap.toFixed(2)}

Strong Favorites (<3): ${strongFavs}
Mid Range Runners (3–10): ${midRange}
Longshots (>10): ${longshots}

Favorite Strength Ratio: ${favStrength.toFixed(2)}
`.trim();

  return fingerprint
}

const findNextRace = async (localDate, searchDate) => {
    const search_date = localDate
        const race_date = searchDate
        const user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"

        const arr = []

        let next_race = undefined

        let total_race_count = 0

        for (let index = 0; index < meetings.length; index++) {
            const ground = meetings[index];
            if(ground.meetingLocalTime === search_date) {
                const meeting_url = "https://www.stbet.com/stbetrest/services/online/meeting/allEventsForMeeting?meetingId=" + ground.id
                const respose = await axios.get(meeting_url, {
                    headers : {
                        "User-Agent" : user_agent
                    }
                })

                const races = []

                for (let index = 0; index < respose.data.payload.length; index++) {
                    const bd = respose.data.payload[index];
                    const exact_race = today_races.find((f) => f.place === bd.meetingName)
                    if(bd.meetingLocalTime === search_date) {
                        // console.log(bd.meetingName, ' - ', exact_race.races.length)
                        for (let index = 0; index < bd.eventLightDTOs.length; index++) {
                            const evt = bd.eventLightDTOs[index];
                            let is_scraped = false
                            let found_race = undefined

                            if (exact_race) {
                                const found = exact_race.races.find((f) => f.id === evt.id)
                                if(found){
                                    is_scraped = true
                                    found_race = found
                                }
                                
                            }
                            

                            if(!is_scraped){
                                const time = evt.eventTime.split(':')
                                const hour = time[0]
                                const minutes = time[1]
                                const seconds = time[2]

                                let race_time = new Date()
                                race_time.setHours(hour)
                                race_time.setMinutes(minutes)
                                race_time.setSeconds(seconds)
                                race_time.setMilliseconds(0)

                                // console.log(race_time.toString())

                                if(race_time >= new Date()){
                                    if(next_race){
                                        if(next_race.custom_race_time >= race_time){
                                            next_race = {...evt, custom_race_time : race_time}
                                            console.log(race_time.toString())
                                        }
                                    } else {
                                        next_race = {...evt, custom_race_time : race_time}
                                        console.log(race_time.toString())
                                    }
                                }
                            }
                            

                            if(evt.eventLocalDate === race_date && evt.eventSettleStatus === "R" && !is_scraped){
                                const winning_url = 'https://www.stbet.com/stbetrest/services/online/meeting/eventResultsByEventId?eventId=' + evt.id
                                const runners_url = 'https://www.stbet.com/stbetrest/services/online/meeting/eventResultsBySelection?eventId=' + evt.id

                                const winning_respose = await axios.get(winning_url, {
                                    headers : {
                                        "User-Agent" : user_agent
                                    }
                                })

                                const runners_respose = await axios.get(runners_url, {
                                    headers : {
                                        "User-Agent" : user_agent
                                    }
                                })
                                
                                races.push({
                                    ...evt,
                                    winners : winning_respose.data[0],
                                    runners : runners_respose.data
                                })
                            } else {
                                if(found_race) {
                                    races.push(found_race)
                                }
                            }
                            
                        }
                    }
                    
                    
                }

                total_race_count += races.length

                arr.push({
                    place : ground.meetingName,
                    races
                })
            }
        }

        console.log('Total Number of races : ', total_race_count)

        if(next_race){
            const next_race_runners_url = 'https://www.stbet.com/stbetrest/services/online/meeting/eventSelections?eventId=' + next_race.id
            const next_runner = await axios.get(next_race_runners_url, {
                headers : {
                    "User-Agent" : user_agent
                }
            })
            next_race = {
                ...next_race,
                runners : next_runner.data
            }
        }

        // const indexJsonFile = path.join(__dirname,"../json/sola/" + market + "/");
        let cateCon = JSON.stringify(arr);
        fs.writeFile(
            __dirname + "/today_races.json",
            cateCon,
            "utf8",
            function (err) {
                if (err) {
                    console.log("An error occured while writing JSON Object to File.");
                    return console.log(err);
                }
            }
        );

        if(next_race){
            let nxt = JSON.stringify(next_race);
            fs.writeFile(
                __dirname + "/next_race.json",
                nxt,
                "utf8",
                function (err) {
                    if (err) {
                        console.log("An error occured while writing JSON Object to File.");
                        return console.log(err);
                    }
                }
            );
        }

        return next_race
}



module.exports = router