const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();

const fromSnakeToCamel = (dbObj) => {
  return {
    districtId: dbObj.district_id,
    districtName: dbObj.district_name,
    stateId: dbObj.state_id,
    stateName: dbObj.state_name,
    population: dbObj.population,
    cases: dbObj.cases,
    cured: dbObj.cured,
    active: dbObj.active,
    deaths: dbObj.deaths,
  };
};

const snakeToCamel = (dbObj) => {
  return {
    totalCases: dbObj.cases,
    totalCured: dbObj.cured,
    totalActive: dbObj.active,
    totalDeaths: dbObj.deaths,
  };
};

const logger = (request, response, next) => {
  console.log("Logger");
  next();
};
const authenticateAPI = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Get Books API
app.get("/states/", authenticateAPI, async (request, response) => {
  const getStateQuery = `
            SELECT
              *
            FROM
             state
            ORDER BY
             state_id;`;
  const stateArray = await db.all(getStateQuery);
  response.send(stateArray.map((each) => fromSnakeToCamel(each)));
});

//Get Book API
app.get("/states/:stateId/", authenticateAPI, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
      SELECT
       *
      FROM
       state 
      WHERE
       state_id = ${stateId};
    `;
  const state = await db.get(getStateQuery);
  response.send(fromSnakeToCamel(state));
});

//Create new District API
app.post("/districts/", authenticateAPI, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const Query = `INSERT INTO 
  district (district_name, state_id, cases, cured, active, deaths)
   VALUES('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`;
  await db.run(Query);
  response.send("District Successfully Added");
});

//GET DISTRICT ID API
app.get(
  "/districts/:districtId/",
  authenticateAPI,
  async (request, response) => {
    const { districtId } = request.params;
    const Query = `SELECT * FROM district WHERE district_id = ${districtId};`;
    const dbResponse = await db.get(Query);
    response.send(fromSnakeToCamel(dbResponse));
  }
);

//DELETE API
app.delete(
  "/districts/:districtId/",
  authenticateAPI,
  async (request, response) => {
    const { districtId } = request.params;
    const Query = `DELETE FROM district WHERE district_id = ${districtId};`;
    await db.run(Query);
    response.send("District Removed");
  }
);
//Put district it

// PUT API
app.put(
  "/districts/:districtId/",
  authenticateAPI,
  async (request, response) => {
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const { districtId } = request.params;
    const Query = `UPDATE district SET 
    district_name = '${districtName}',
    state_id =  ${stateId}, 
    cases = ${cases},
    cured = ${cured}, 
    active = ${active}, 
    deaths =  ${deaths}
   WHERE district_id = ${districtId};`;
    await db.run(Query);
    response.send("District Details Updated");
  }
);

//State Stats

app.get(
  "/states/:stateId/stats/",
  authenticateAPI,
  async (request, response) => {
    const { stateId } = request.params;
    const Query = `SELECT
                 SUM(cases) as totalCases, 
                 SUM(cured) as totalCured, 
                 SUM(active) as totalActive, 
                 SUM(deaths) as totalDeaths 
                 FROM district 
                 WHERE state_id = ${stateId} 
                 GROUP BY state_id;`;
    const dbResponse = await db.get(Query);
    response.send(dbResponse);
  }
);

module.exports = app;
