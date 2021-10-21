const {MongoClient} = require('mongodb');
const express = require('express');

const app = express();
app.use(express.urlencoded());
app.use(express.json());
const port = 3000;
const _client = new MongoClient(uri, { useUnifiedTopology: true });

let _userDatas = {};

async function main() {
    

    try {
        // Connect to the MongoDB cluster
        await _client.connect();

        // Make the appropriate DB calls
        const database = _client.db("NurbsEditor");
        const surfaces = database.collection("surfaces");

    } catch (e) {
        console.error(e);
    }
};

//#region utils
function parseIp (req) {
    return (req.headers['x-forwarded-for'] || '').split(',').pop().trim() || 
    req.socket.remoteAddress
};
//#endregion

main().catch(console.error);

//#region data structures
function SimpleDot(x, y, z, isMainPoint) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.mainPoint = isMainPoint;
}

function UserData(patches_list) {
    this.patches_list = patches_list;
}

//#endregion

//#region http requests
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
  });

app.post('/diploma', (req, res) => {
    console.log("post responce ");

    let ip = parseIp(req);
    let patches_list = [];
    let twoDimensionalArray = req.body;
    for (let i = 0; i < twoDimensionalArray.length; i++) {
        let dots_list = [];

        for (let j = 0; j < twoDimensionalArray[0].length; j++) {
            const mesh = twoDimensionalArray[i][j];

            if (mesh != undefined) {
                const x = mesh.x;
                const y = mesh.y;
                const z = mesh.z;
                dots_list.push(new SimpleDot(x, y, z));
            } 
            else {
                dots_list.push(undefined);
            }
        }
        patches_list.push(dots_list);
    };

    _userDatas[ip] = new UserData(patches_list);
    saveToDb(ip).catch(console.dir);
});

app.get('/diploma', function (req, res) {
    console.log("get responce ");
    loadFromDb(req, res).catch(console.dir);
});

app.listen(3000, () => {
    console.log(`Example app listening at http://localhost:${port}`)
});
//#endregion

async function loadFromDb(req, res) {
    try {
        await _client.connect();
        const database = _client.db("NurbsEditor");
        const surfaces = database.collection("Surfaces");

        const query = { _id: parseIp(req) };
        const points = await surfaces.findOne(query); 

        let patches_list = [];
        let twoDimensionalArray = points.Points;
        for (let i = 0; i < twoDimensionalArray.length; i++) {
            let dots_list = [];

            for (let j = 0; j < twoDimensionalArray[0].length; j++) {
                const mesh = twoDimensionalArray[i][j];

                if (mesh != undefined) {
                    const x = mesh.x;
                    const y = mesh.y;
                    const z = mesh.z;
                    dots_list.push(new SimpleDot(x, y, z));
                } 
                else {
                    dots_list.push(undefined);
                }
            }
            patches_list.push(dots_list);
        };

        _userDatas[parseIp(req)] = new UserData(patches_list);

        console.log(_userDatas[parseIp(req)]);

        res.send(_userDatas[parseIp(req)]);
    }
    catch (e) {
        console.error(e);
    }
}

async function saveToDb(ip) {
    try {
        await _client.connect();
        const database = _client.db("NurbsEditor");
        const surfaces = database.collection("Surfaces");

        let patches_list = _userDatas[ip].patches_list;
        let dots_list = [];
        for (let i = 0; i < patches_list.length; i++) {
            dots_list.push([]);
    
            for (let j = 0; j < patches_list[0].length; j++) {
                const mesh = patches_list[i][j];
    
                if (mesh != undefined) {
                    dots_list[i].push({
                        x: mesh.x,
                        y: mesh.y,
                        z: mesh.z
                    });
                } 
                else {
                    dots_list[i].push(undefined);
                }
            }
        };

        const res = await surfaces.updateOne(
            {_id : ip},
            {$set: {Points : dots_list}},
            {upsert: true}
        );
        console.log(`A document was inserted with the _id: ${res.insertedId}`);
    } catch (e) {
        console.error(e);
    }
}
