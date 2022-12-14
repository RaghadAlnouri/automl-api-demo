// Copyright 2018 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Replace the strings below with your own project & model info
const project = 'NLP-course';
const region = 'us-central1';
const automl_model = '6854896447276449792';



const sizeOf = require('image-size');
const fs = require('fs');
const exec = require('child_process').exec;

// GCP libraries
const gcs = require('@google-cloud/storage');
const gcsClient = new gcs();
const automl = require('@google-cloud/automl');
const predictionClient = new automl.PredictionServiceClient();

// Firebase libraries

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const db = admin.firestore();
admin.initializeApp(functions.config().firebase);

global.ticker = function ticker () {
    console.log("foo Got the ticker called");
  }
  
  process.stdin.on("data", function(input) {
  
    // don't forget to call .trim() to remove the \n
    var fn = input.toString().trim();
  
    // function exists
    if (fn in global && typeof global[fn] === "function") {
      global[fn]();
    }
  
    // function does not exist
    else {
      console.log("could not find " + fn + " function");
    }
  });
  
process.stdin.resume();


// Instantiates a client
const client = new AutoMlClient();

function deployModelWithNodeCount() {
  // Construct request
  const request = {
    name: client.modelPath(projectId, location, modelId),
    imageClassificationModelDeploymentMetadata: {
      nodeCount: 2,
    },
  };

  const [operation] = await client.deployModel(request);

  // Wait for operation to complete.
  const [response] = await operation.promise();
  console.log(`Model deployment finished. ${response}`);
}

deployModelWithNodeCount();

function callAutoMLAPI(b64img) {
    return new Promise((resolve, reject) => {
        const payload = {
            "image": {
              "imageBytes": b64img
            }
          }
        const reqBody = {
            name: predictionClient.modelPath(project, region, automl_model),
            payload: payload
        }
        predictionClient.predict(reqBody)
            .then(responses => {
                console.log('Got a prediction from AutoML API!', JSON.stringify(responses));
                resolve(responses);
            })
            .catch(err => {
                console.log('AutoML API Error: ',err);
                reject(err);
            });
    });
    
}

exports.callCustomModel = functions.storage.object().onFinalize(event => {
    const file = gcsClient.bucket(event.bucket).file(event.name);
    let destination = '/tmp/' + event.name.replace(/\s/g, '');
    return file.download({destination: destination})
        .then(() => {
            if(sizeOf(destination).width > 600) {
                console.log('scaling image down...');
                return resizeImg(destination);
            } else {
                return destination;
            }     
        })
        .then(() => {
            let bitmap = fs.readFileSync(destination);
            let data = new Buffer(bitmap).toString('base64');
            return callAutoMLAPI(data);  
        })
        .then((response) => {
            let predictions = {};

            // Get only the first prediction response
            let data = response[0]['payload'];
            predictions[data[0].displayName] = data[0].classification.score;

            if (Object.keys(predictions).length === 0) {
                predictions = {"predictionErr": "No high confidence predictions found"};
            }
            return db.collection('images').doc(event.name).set(predictions);
        })
        .then(() => {
            // Delete tmp image file to clean up resources
            return new Promise((resolve, reject) => {
                fs.unlinkSync(destination, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
                });
            });
        })
        .catch((err) => {
            console.log('error occurred', err);
        });
});