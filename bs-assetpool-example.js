// This script shows how the BrightSign Asset Pool can be used from
// JavaScript. It works from both NodeJS and Chromium. It is not
// intended as a full application as it doesn't do anything with the
// assets that are downloaded.

// Customise these settings for your environment
const storagePath = "/storage/sd/";
const poolPath = storagePath + "examplePool";
const serverPrefix = "http://repton/";

const fs = require('fs');
const AssetPool = require("@brightsign/assetpool");
const AssetPoolFiles = require("@brightsign/assetpoolfiles");
const AssetPoolFetcher = require("@brightsign/assetpoolfetcher");
const AssetRealizer = require("@brightsign/assetrealizer");

// Create the asset collection array to be used by the rest of the
// program. The asset collection will usually come either directly or
// indirectly from a server somewhere rather than being generated in
// code like this.
function makeAssetCollection()
{
    // Assets must have a name and a link. Everything else is
    // optional. You can add your own properties if required. For
    // example, the "osUpdate" property here is only used by this
    // script.
    let videoAsset1 = {
	name: "elephant.mpg",
	hash: { method: "SHA256",
		hex: "e9bb03172aae0a16ca4cabf89d8f4b7407add15117127af5bf61e9ee1dfe3b7c" },
	link: serverPrefix + "Media/Elephants%20Dream/25Mbps_mpeg2_ed_1920x1080_29.97fps.mpg",
	size: 70083568,
    };

    let videoAsset2 = {
	name: "BrightSign4K.mp4",
	hash: { method: "SHA512",
		hex: "7e9d654ddedf93ee78ba1b6ca1cfb6b0130ab2eb9081401e7bf8044edbb5e6468c374b36690fdc79242d64f7056f297341af35c35caed0c4eaad9c6f007dcb2c" },
	link: serverPrefix + "Media/BrightSign4kShoot/Bright_Sign_4K_V1_Full_Test_90_C_4_100M_CBR.mp4",
	size: 303630961,
    };

    // We don't want to risk actually changing the OS version on the
    // BrightSign running this script, so the filename does not end in
    // ".bsfw". If a real script wanted to realise an OS update file
    // then it would need to do so.
    let osUpdateAsset = {
	name: "pantera-8.1.84-update.bsfw-not-really",
	hash: { method: "SHA1", hex: "cba9ea3695aa3ebf807e97a6736fb2989d4e0356" },
	link: serverPrefix + "builds/brightsign-releases/8.1/8.1.84/pantera-8.1.84-update.bsfw",
	size: 131226520,
	osUpdate: true,
    };

    let assetCollection = [
	videoAsset1,
	videoAsset2,
	osUpdateAsset,
    ];

    return assetCollection;
}

// Convert a progress event to a useful string for reporting
function progressString(event)
{
    if (event.currentFileTotal === undefined) {
	// If the size of the asset was not specified in the asset collection, then the total size may not be reported
	// during the fetch.
	return event.currentFileTransferred.toString() + " of unknown";
    } else {
	return event.currentFileTransferred.toString() + " of " + event.currentFileTotal.toString() + " "
	    + (100*event.currentFileTransferred / event.currentFileTotal).toFixed(0) + "%";
    }
}

// Download any assets that aren't already in the pool into the pool
// whilst reporting progress.
async function fetchAssets(assetPool, assetCollection)
{
    console.log("Fetch: " + JSON.stringify(assetCollection.map(asset => asset.name)));

    let assetFetcher = new AssetPoolFetcher(assetPool);

    assetFetcher.addEventListener("fileevent", (event) => {
	// This is called each time the fetcher has finished trying to
	// download an asset, whether successful or not. It is not
	// called for any assets that are already in the pool.
	console.log("ASSET [" + (event.index + 1).toString() + "] "
		    + event.fileName + " complete: " + event.responseCode.toString() + " " + event.error);
    });

    assetFetcher.addEventListener("progressevent", (event) => {
	// This is called at approximately the progress interval
	// specified in the options to indicate how far through the
	// download
	console.log("ASSET [" + (event.index + 1).toString() + "/" + event.total.toString() + "] " + event.fileName
		    + " progress: " + progressString(event));
    });

    const fetchOptions = {
	// receive asset progress events about every five seconds.
	progressInterval: 5,
	// try to download each asset three times before giving up.
	fileRetryCount: 3,
	// Give up if we fail to download at least 1024 bytes in each
	// ten second period.
	minimumTransferRate: { bytesPerSecond: 1024, periodInSeconds: 10 },
    };

    try {
	await assetFetcher.start(assetCollection, fetchOptions);
    }
    catch (err) {
	console.log("FETCH FAILED: " + err.message);
	throw(err);
    }
}

// In order to make use of an asset from the pool you need to look up
// its pool filename so you can refer to it there.
async function useAssets(assetPool, assetCollection)
{
    let files = new AssetPoolFiles(assetPool, assetCollection);

    for (const fileName of [ 'elephant.mpg', 'BrightSign4K.mp4' ]) {
	const path = await files.getPath(fileName);
	console.log("Asset " + fileName + " is at " + path);
    }
}

// Some files need to appear in the filesystem outside the pool. For
// example, BrightSign OS update files must be written to the root of
// a storage device for them to be found. Realizing will copy files,
// so can be slow on large files.
async function realizeAssets(assetPool, assetCollection)
{
    let realizer = new AssetRealizer(assetPool, storagePath);

    // We only want to realize the files that we have to
    const assetsToRealize = assetCollection.filter(asset => asset.osUpdate);
    console.log("Realize: " + JSON.stringify(assetsToRealize.map(asset => asset.name)));
    await realizer.realize(assetsToRealize);
}

function ensureDirectoryExists(path) {
    try {
	fs.mkdirSync(path);
    } catch (err)
    {
	if (err.code != 'EEXIST')
	    throw(err);
    }
}

function exceptionToString(err)
{
    if (err instanceof Error)
        return err.name + ":" + err.message;
    else if (typeof(err) === "string")
        return err;
    else
        return JSON.stringify(err);
}

async function runExample()
{
    console.log("Start");
    ensureDirectoryExists(poolPath);

    // Only one AssetPool instance should be created for a given pool
    // path. Having multiple instances risks them disagreeing over
    // which assets are protected during pruning.
    let assetPool = new AssetPool(poolPath);

    // Don't let the pool grow any larger than 500MiB
    await assetPool.setMaximumPoolSize(500 * 1024 * 1024);

    // Don't let free space on the storage device fall below 100MiB
    await assetPool.reserveStorage(100 * 1024 * 1024);

    const assetCollection = makeAssetCollection();

    // We need to stop the fetcher from pruning any of the assets we
    // currently care about in order to make space for fetching new
    // assets or realizing existing ones. Assets are protected until
    // the AssetPool instance is destroyed or unprotectAssets is
    // called for the same name.
    await assetPool.protectAssets("collection1", assetCollection);

    await fetchAssets(assetPool, assetCollection);

    // In this case any failure to fetch the assets will cause
    // fetchAssets to have thrown an exception, so we won't get this
    // far. However, in a larger script it may be more convenient to
    // call areAssetsReady to determine whether the asset collection
    // is ready for use.
    if (await assetPool.areAssetsReady(assetCollection)) {
	await useAssets(assetPool, assetCollection);
	await realizeAssets(assetPool, assetCollection);
    } else {
	console.log("Assets were not downloaded successfully");
    }
}

runExample()
    .then(() => {
	console.log("Complete");
	process.exit(0);
    })
    .catch((err) => {
	console.log("Failed " + exceptionToString(err));
	process.exit(1);
    });
