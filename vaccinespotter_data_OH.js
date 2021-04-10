require('dotenv').config();
const fs = require('fs');
const simpleGit = require('simple-git');
const git = simpleGit();
const fetch = require('node-fetch');

(async () => {

    while(true){
        
        const response = await fetch('https://www.vaccinespotter.org/api/v0/states/OH.json')
        let vs = await response.json()    
        //let vs = JSON.parse(fs.readFileSync('./vaccinespotter_OH.json'))

        let locations = vs.features
        let storesAllAvailability = []

        for(let i=0; i<locations.length; i++){

            let start_date = null
            let end_date = null

            let location = locations[i]
            let storeDataFormat = {
                address: location.properties.address+', '+location.properties.city+', '+location.properties.state+' '+location.properties.postal_code,
                start_date: new Date(),
                end_date: new Date(),
                clear_existing: true, 
                availability: []
            }

            if(location.properties.appointments != null){
                
                dates = location.properties.appointments
                let store_availability = []
                for(let j=0; j<dates.length; j++){       

                    if(!dates[j].type){
                        console.log(location)
                    }
                    if(dates[j].type.indexOf("2") >= 0){
                        //2nd dose, so skip it.
                        continue;
                    }
                    let date = dates[j].time
                    if(end_date == null || new Date(date) > new Date(end_date)){
                        end_date = new Date(date)
                    }
                    if(start_date == null || new Date(date) < new Date(start_date)){
                        start_date = new Date(date)
                    }        

                    let datetime = new Date(date)
                    let dateString = datetime.getFullYear()+"-"+String(datetime.getMonth()+1).padStart(2, '0')+"-"+String(datetime.getDate()).padStart(2, '0')
                    let timeString = String(datetime.getHours()).padStart(2, '0')+":"+String(datetime.getMinutes()).padStart(2, '0')+":"+String(datetime.getSeconds()).padStart(2, '0')

                    let available = {
                        availability_time: dateString+' '+timeString,
                        brand: getBrandCode(dates[j].type)
                    }
                    store_availability.push(available)      

                }
                
                storeDataFormat.provider_brand = location.properties.provider_brand
                storeDataFormat.availability = store_availability                
                    
                storeDataFormat.start_date = start_date
                storeDataFormat.end_date = end_date
                storeDataFormat.original_data = location
                storeDataFormat.original_data_unix_time = location.properties.appointments_last_fetched
                storeDataFormat.origina_data_time = new Date(location.properties.appointments_last_fetched).toISOString()              
                storesAllAvailability.push(storeDataFormat)
            }

        }


        storesAllAvailability = storesAllAvailability.filter((l)=> ['walmart','walgreens'].includes(l.provider_brand))



        // Delete previous availability files 
        let files = fs.readdirSync(process.cwd())
        files = files.filter((f) => { return (f.indexOf('vaccinespotter_availability_') > -1 ) })
        files.forEach((f) => fs.unlinkSync(f))

        // Create/Write new availability file 
        let current_time = new Date().getTime();
        let filename = 'vaccinespotter_availability_'+current_time+'.json'
        fs.writeFileSync(filename, JSON.stringify(storesAllAvailability))

        /*
        console.log("Git pull...")
        await git.pull()
        console.log("Git pull...FINISHED")            
        // Make change to git and push 
        console.log('Git add, commit, push...')
        await git.add('.')
        await git.commit('Sent Full Availablity for S3 for Store:')
        await git.push()
        console.log('Git add, commit, push...FINISHED')
        */


        // Upload availability file to AWS S3 BUCKET 
        console.log(new Date()+'::do aws upload...')
        // snippet-start:[s3.JavaScript.buckets.upload]
        // Load the AWS SDK for Node.js
        var AWS = require('aws-sdk');
        // Set the region 
        AWS.config.update({region: process.env.AWS_REGION});
        // Create S3 service object
        s3 = new AWS.S3({apiVersion: '2006-03-01'});
        // call S3 to retrieve upload file to specified bucket
        var uploadParams = {Bucket: process.env.AWS_S3_BUCKET, Key: '', Body: ''};
        var file = filename;

        // Configure the file stream and obtain the upload parameters
        var fileStream = fs.createReadStream(file);
        fileStream.on('error', function(err) {
        console.log('File Error', err);
        });
        uploadParams.Body = fileStream;
        var path = require('path');
        uploadParams.Key = path.basename(file);

        // call S3 to retrieve upload file to specified bucket
        s3.upload (uploadParams, function (err, data) {
            if (err) {
                console.log("Error", err);
            } if (data) {
                console.log("Upload Success", data.Location);
            }
        });
        

        await delay(600000);
    }


})();


function delay(time) {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
 }

function getBrandCode(str){
    if(str.toLowerCase().indexOf('moderna') >= 0){
        return 'm'        
    } else if (str.toLowerCase().indexOf('pfizer') >= 0){
        return 'p'        
    } else if (str.toLowerCase().indexOf('john') >= 0){
        return 'j'        
    } else {
        return ''
    }
}