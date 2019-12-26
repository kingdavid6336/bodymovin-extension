const imagemin = require('imagemin');
// const imageminJpegtran = require('imagemin-jpegtran');
// const imageminJpegoptim = require('imagemin-jpegoptim');
const imageminPngquant = require('imagemin-pngquant');
const pngToJpeg = require('png-to-jpeg');
const express = require('express')
var fs = require('fs');
var bodyParser = require('body-parser');
var PNG = require('pngjs').PNG;
var LottieToFlare = require('./lottie_to_flare/test.bundle.js').default
var ltf = new LottieToFlare();

var JSZip = require('jszip');

async function processImage(path, compression, hasTransparency) {
	//C:\\Program Files\\Adobe\\Adobe After Effects 2020\\Support Files
	// const files = await imagemin(['C:/Users/tropi/AppData/Roaming/Adobe/CEP/extensions/bodymovin/server/images/*.{jpg,png}'], {
	const destinationPathFolder = path.substr(0, path.lastIndexOf('/') + 1);
	const destinationFullPath = destinationPathFolder;
	const plugins = []
	if (hasTransparency) {
		plugins.push(imageminPngquant({
			quality: [0, compression]
		}))
	} else {
		/*plugins.push(imageminJpegoptim({
			// max: Math.round(compression * 100)
			max: compression
		}))*/
		plugins.push(pngToJpeg({quality: Math.round(compression * 100)}))
	}
	const files = await imagemin([path], {
	// const files = await imagemin(['./images/hernan.jpg'], {
			destination: destinationFullPath,
			plugins
		});

		return files
		// return files
		//=> [{data: <Buffer 89 50 4e …>, destinationPath: 'build/images/foo.jpg'}, …]
}

const app = express.createServer();
app.use(bodyParser.json())
const port = 3119

app.get('/', (req, res) => {

	res.send('Root 2')
})

function checkImageTransparency(imagePath) {
	return new Promise((resolve, reject) => {
		try {
			const stream = fs.createReadStream(imagePath)
			stream.on('error', function(error) {
				reject(error)
			})
			const pngStream = stream.pipe(new PNG())

			pngStream.on('metadata', function(meta) {
				// console.log('meta.alpha', meta.alpha)
				// resolve(meta.alpha + 'testtt')
			})

			pngStream.on('parsed', function() {
				var hasTransparency = false
				for (var y = 0; y < this.height; y++) {
					for (var x = 0; x < this.width; x++) {
						var idx = (this.width * y + x) << 2;
						if (this.data[idx+3] !== 255) {
							hasTransparency = true
							x = this.width
							y = this.height
						}
					}
				}
				resolve(hasTransparency)
			})

		} catch(err)
		{
			reject(err)
		}
	})
}

app.post('/encode', async function(req, res){
	if (req.body.path) {
		const fs = require('fs');
		const decodedPath = decodeURIComponent(req.body.path)

		const buff = fs.readFileSync(decodedPath);
		const base64data = buff.toString('base64');
		res.send({
			status: 'success',
			data: base64data,
		})
	} else {
		res.send({
			status: 'error',
			message: 'missing params',
		})
	}
})

app.post('/processImage/', async function(req, res){
	if (req.body.path && req.body.compression) {
		try {
			const decodedPath = decodeURIComponent(req.body.path)
			const hasTransparency = await checkImageTransparency(decodedPath)
			const processedImages  = await processImage(decodedPath, req.body.compression, hasTransparency)
			if (!hasTransparency) {
				var renamedPath = decodedPath.substr(0, decodedPath.lastIndexOf('.png')) + '.jpg'
				fs.renameSync(decodedPath, renamedPath)
			}
			if (processedImages.length) {
				res.send({
					status: 'success',
					path: processedImages[0].destinationPath,
					extension: hasTransparency ? 'png' : 'jpg',
				})
			} else {
				res.send({
					status: 'error',
					message: 'Could not export',
				})
			}
		} catch(error) {
			res.send({
				status: 'error',
				err: error,
				message: error.message,
			});
		}
	} else {
		res.send({
			status: 'error',
			message: 'missing params',
		});
	}
});

app.post('/convertToFlare/', async function(req, res){
	if (req.body.origin && req.body.destination && req.body.fileName) {
		try {
			// const originPath = "C:\\Users\\tropi\\AppData\\Local\\Temp\\Bodymovin\\gwir6aia7c\\rive";
			// const destinationPath = "C:\\Users\\tropi\\AppData\\Local\\Temp\\Bodymovin\\gwir6aia7c\\riveExport";
			// var destinationName = 'flare.flr2d';
			const originPath = decodeURIComponent(req.body.origin);
			const destinationPath = decodeURIComponent(req.body.destination);
			var destinationName = decodeURIComponent(req.body.fileName);

			const zip = JSZip();

			const dirItems = await readdir(originPath);
			const jsonFilePath = await getJsonPath(dirItems, originPath);

			const jsonDataString = await getJsonData(jsonFilePath)
			const result = await ltf.convert(jsonDataString);
			zip.file(destinationName, JSON.stringify(result));

			// Adding assets
			const jsonData = JSON.parse(jsonDataString)
			const lottieAssets = jsonData.assets
				.filter(asset => !!asset.p)

			const assetsData = await Promise.all(lottieAssets.map(asset => {
				return getFile(originPath + '\\' + asset.u + asset.p)
			}))
			lottieAssets.forEach((asset, index) => {
				zip.file(asset.id, assetsData[index]);
			})

			const zipBlob = await zip.generateAsync({type: 'nodebuffer'})

			fs.writeFile(destinationPath + '\\' + destinationName, zipBlob, 'binary', (error, success) => {
				console.log(error, success)
			});
			

			res.send({
				status: 'success',
			});
		} catch(error) {
			res.send({
				status: 'error',
				error: error,
				message: error ? error.message || 'No message but error' : 'No Error',
			});
		}
	} else {
		res.send({
			status: 'error',
			message: 'missing params',
		});
	}
});



// Helpers

function readdir(path) {
	return new Promise((resolve, reject) => {
		fs.readdir(path, function(err, items) {
			if (!err && items) {
				resolve(items)
			} else {
				reject('No Items')
			}
		});
	})
}

function getJsonPath(items, originPath) {
	return new Promise((resolve, reject) => {
		let jsonFilePath = '';
		for (var i=0; i<items.length; i++) {
			console.log(items[i])
			console.log(items[i].indexOf('.json'))
			if (items[i].indexOf('.json') !== -1) {
				jsonFilePath = originPath + '\\' + items[i];
				break;
			}
		}
		if (jsonFilePath) {
			resolve(jsonFilePath)
		} else {
			reject('No json Path');
		}
	})
}

function getJsonData(path) {
	return new Promise((resolve, reject) => {
		const jsonData = fs.readFileSync(path, "utf8");
		if (jsonData) {
			resolve(jsonData)
		} else {
			reject('Failed getting Json')
		}
	})
}

function getFile(path, encoding = '') {
	return new Promise((resolve, reject) => {
		const fileData = fs.readFileSync(path, encoding);
		if (fileData) {
			resolve(fileData)
		} else {
			reject('Failed getting File: ' + path)
		}
	})
}

////  TESTING ULRS

app.get('/encode', async function(req, res){
	const fs = require('fs');

	let buff = fs.readFileSync('images/img_0_test.png');
	let base64data = buff.toString('base64');
	res.send({
		status: 'success',
		data: base64data,
	})
})

app.get('/process', async function(req, res){
	try {
		const hasTransparency = await checkImageTransparency('images/img_0_test.png')
		const processedImages  = await processImage(decodeURIComponent(req.body.path), req.body.compression, hasTransparency)
		if (processedImages.length) {
			res.send({
				status: 'success',
				path: processedImages[0].destinationPath,
			})
		} else {
			res.send({
				status: 'error',
				message: 'Could not export',
			})
		}
	} catch(error) {
		res.send({
			status: 'error',
			err: error,
			message: error.message,
		});
	}

});



const getFlare = async function(req, res){
	try {
		const originPath = "C:\\Users\\tropi\\AppData\\Local\\Temp\\Bodymovin\\gwir6aia7c\\rive";
		const destinationPath = "C:\\Users\\tropi\\AppData\\Local\\Temp\\Bodymovin\\gwir6aia7c\\riveExport";
		var destinationName = 'flare.flr2d';

		const zip = JSZip();

		const dirItems = await readdir(originPath);
		const jsonFilePath = await getJsonPath(dirItems, originPath);

		const jsonDataString = await getJsonData(jsonFilePath)
		const result = await ltf.convert(jsonDataString);
		zip.file(destinationName, JSON.stringify(result));

		// Adding assets
		const jsonData = JSON.parse(jsonDataString)
		const lottieAssets = jsonData.assets
			.filter(asset => !!asset.p)

		const assetsData = await Promise.all(lottieAssets.map(asset => {
			return getFile(originPath + '\\' + asset.u + asset.p)
		}))
		lottieAssets.forEach((asset, index) => {
			zip.file(asset.id, assetsData[index]);
		})

		const zipBlob = await zip.generateAsync({type: 'nodebuffer'})

		fs.writeFile(destinationPath + '\\' + destinationName, zipBlob, 'binary', (error, success) => {
			console.log(error, success)
		});
		

		res.send({
			status: 'success',
		});
	} catch(error) {
		res.send({
			status: 'error',
			error: error
		});
	}
}

app.get('/flare', getFlare);
getFlare({send:(message)=>{console.log(message)}}, {send:(message)=>{console.log(message)}});

////  END TESTING ULRS

app.listen(port)