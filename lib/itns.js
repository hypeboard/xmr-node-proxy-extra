"use strict";
const multiHashing = require('multi-hashing');
const cnUtil = require('cryptonote-util');
const bignum = require('bignum');
const support = require('./support.js')();
const crypto = require('crypto');

let debug = {
    pool: require('debug')('pool'),
    diff: require('debug')('diff'),
    blocks: require('debug')('blocks'),
    shares: require('debug')('shares'),
    miners: require('debug')('miners'),
    workers: require('debug')('workers')
};

let baseDiff = bignum('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF', 16);

Buffer.prototype.toByteArray = function () {
    return Array.prototype.slice.call(this, 0);
};

function blockHeightCheck(nodeList, callback) {
    let randomNode = nodeList[Math.floor(Math.random() * nodeList.length)].split(':');

}

function getRemoteNodes() {
    let knownNodes = [
		'91.219.164.176:58782',
		'154.0.169.48:58782'
    ]; // Prefill the array with known good nodes for now.  Eventually will try to download them via DNS or http.
}

this.BlockTemplate = function(template) {
        /*
        Generating a block template is a simple thing.  Ask for a boatload of information, and go from there.
        Important things to consider.
        The reserved space is 13 bytes long now in the following format:
        Assuming that the extraNonce starts at byte 130:
        |130-133|134-137|138-141|142-145|
        |minerNonce/extraNonce - 4 bytes|instanceId - 4 bytes|clientPoolNonce - 4 bytes|clientNonce - 4 bytes|
        This is designed to allow a single block template to be used on up to 4 billion poolSlaves (clientPoolNonce)
        Each with 4 billion clients. (clientNonce)
        While being unique to this particular pool thread (instanceId)
        With up to 4 billion clients (minerNonce/extraNonce)
        Overkill?  Sure.  But that's what we do here.  Overkill.
         */

        // Set this.blob equal to the BT blob that we get from upstream.
        this.blob = template.blocktemplate_blob;
        this.idHash = crypto.createHash('md5').update(template.blocktemplate_blob).digest('hex');
        // Set this.diff equal to the known diff for this block.
        this.difficulty = template.difficulty;
        // Set this.height equal to the known height for this block.
        this.height = template.height;
        // Set this.reserveOffset to the byte location of the reserved offset.
        this.reserveOffset = template.reserved_offset;
        // Set this.buffer to the binary decoded version of the BT blob.
        this.buffer = new Buffer(this.blob, 'hex');
        // Copy the Instance ID to the reserve offset + 4 bytes deeper.  Copy in 4 bytes.
        instanceId.copy(this.buffer, this.reserveOffset + 4, 0, 3);
        // Generate a clean, shiny new buffer.
        this.previous_hash = new Buffer(32);
        // Copy in bytes 7 through 39 to this.previous_hash from the current BT.
        this.buffer.copy(this.previous_hash, 0, 7, 39);
        // Reset the Nonce. - This is the per-miner/pool nonce
        this.extraNonce = 0;
        // The clientNonceLocation is the location at which the client pools should set the nonces for each of their clients.
        this.clientNonceLocation = this.reserveOffset + 12;
        // The clientPoolLocation is for multi-thread/multi-server pools to handle the nonce for each of their tiers.
        this.clientPoolLocation = this.reserveOffset + 8;
        this.nextBlob = function () {
            // Write a 32 bit integer, big-endian style to the 0 byte of the reserve offset.
            this.buffer.writeUInt32BE(++this.extraNonce, this.reserveOffset);
            // Convert the blob into something hashable.
            return global.coinFuncs.convertBlob(this.buffer).toString('hex');
        };
        // Make it so you can get the raw block blob out.
        this.nextBlobWithChildNonce = function () {
            // Write a 32 bit integer, big-endian style to the 0 byte of the reserve offset.
            this.buffer.writeUInt32BE(++this.extraNonce, this.reserveOffset);
            // Don't convert the blob to something hashable.  You bad.
            return this.buffer.toString('hex');
        };
 };

function MasterBlockTemplate(template) {
    /*
     We receive something identical to the result portions of the monero GBT call.
     Functionally, this could act as a very light-weight solo pool, so we'll prep it as one.
     You know.  Just in case amirite?
     */
    this.blob = template.blocktemplate_blob;
    this.difficulty = template.difficulty;
    this.height = template.height;
    this.reservedOffset = template.reserved_offset;  // reserveOffset
    this.workerOffset = template.client_nonce_offset; // clientNonceLocation
    this.poolOffset = template.client_pool_offset; // clientPoolLocation
    this.targetDiff = template.target_diff;
    this.targetHex = template.target_diff_hex;
    this.buffer = new Buffer(this.blob, 'hex');
    this.previousHash = new Buffer(32);
    this.job_id = template.job_id;
    this.workerNonce = 0;
    this.poolNonce = 0;
    this.solo = false;
    if (typeof(this.workerOffset) === 'undefined') {
        this.solo = true;
        global.instanceId.copy(this.buffer, this.reservedOffset + 4, 0, 3);
        this.buffer.copy(this.previousHash, 0, 7, 39);
    }
    this.blobForWorker = function () {
        this.buffer.writeUInt32BE(++this.poolNonce, this.poolOffset);
        return this.buffer.toString('hex');
    };
}

function getJob(miner, activeBlockTemplate, bashCache) {
    if (miner.validJobs.size() >0 && miner.validJobs.get(0).templateID === activeBlockTemplate.id && !miner.newDiff && miner.cachedJob !== null && typeof bashCache === 'undefined') {
        return miner.cachedJob;
    }

    let blob = activeBlockTemplate.nextBlob();
    let target = getTargetHex(miner);
    miner.lastBlockHeight = activeBlockTemplate.height;

    let newJob = {
        id: crypto.pseudoRandomBytes(21).toString('base64'),
        extraNonce: activeBlockTemplate.workerNonce,
        height: activeBlockTemplate.height,
        difficulty: miner.difficulty,
        diffHex: miner.diffHex,
        submissions: [],
        templateID: activeBlockTemplate.id
    };

    miner.validJobs.enq(newJob);
    miner.cachedJob = {
        blob: blob,
        job_id: newJob.id,
        target: target,
        id: miner.id
    };
    return miner.cachedJob;
}

function getMasterJob(pool, workerID) {
    let activeBlockTemplate = pool.activeBlocktemplate;
    let btBlob = activeBlockTemplate.blobForWorker();
    let workerData = {
        id: crypto.pseudoRandomBytes(21).toString('base64'),
        blocktemplate_blob: btBlob,
        difficulty: activeBlockTemplate.difficulty,
        height: activeBlockTemplate.height,
        reserved_offset: activeBlockTemplate.reservedOffset,
        worker_offset: activeBlockTemplate.workerOffset,
        target_diff: activeBlockTemplate.targetDiff,
        target_diff_hex: activeBlockTemplate.targetHex
    };
    let localData = {
        id: workerData.id,
        masterJobID: activeBlockTemplate.job_id,
        poolNonce: activeBlockTemplate.poolNonce
    };
    if (!(workerID in pool.poolJobs)) {
        pool.poolJobs[workerID] = support.circularBuffer(4);
    }
    pool.poolJobs[workerID].enq(localData);
    return workerData;
}

function getTargetHex(miner) {
    if (miner.newDiff) {
        miner.difficulty = miner.newDiff;
        miner.newDiff = null;
    }
    let padded = Buffer.alloc(32);
    let diffBuff = baseDiff.div(miner.difficulty).toBuffer();
    diffBuff.copy(padded, 32 - diffBuff.length);

    let buff = padded.slice(0, 4);
    let buffArray = buff.toByteArray().reverse();
    let buffReversed = new Buffer(buffArray);
    miner.target = buffReversed.readUInt32BE(0);
    return buffReversed.toString('hex');
}

function processShare(miner, job, blockTemplate, nonce, resultHash) {
    let template = new Buffer(blockTemplate.buffer.length);
    blockTemplate.buffer.copy(template);
    if (blockTemplate.solo) {
        template.writeUInt32BE(job.extraNonce, blockTemplate.reservedOffset);
    } else {
        template.writeUInt32BE(job.extraNonce, blockTemplate.workerOffset);
    }

    let hash = new Buffer(resultHash, 'hex');
    let hashArray = hash.toByteArray().reverse();
    let hashNum = bignum.fromBuffer(new Buffer(hashArray));
    let hashDiff = baseDiff.div(hashNum);

    if (hashDiff.ge(blockTemplate.targetDiff)) {
        // Validate share with CN hash, then if valid, blast it up to the master.
        let shareBuffer = cnUtil.construct_block_blob(template, new Buffer(nonce, 'hex'));
        let convertedBlob = cnUtil.convert_blob(shareBuffer);
        hash = multiHashing.cryptonight(convertedBlob);
        if (hash.toString('hex') !== resultHash) {
            console.error(global.threadName + "Bad share from miner " + miner.logString);
            miner.messageSender('job', miner.getJob(miner, blockTemplate, true));
            return false;
        }
        miner.blocks += 1;
        process.send({
            type: 'shareFind',
            host: miner.pool,
            data: {
                btID: blockTemplate.id,
                nonce: nonce,
                resultHash: resultHash,
                workerNonce: job.extraNonce
            }
        });
    }
    else if (hashDiff.lt(job.difficulty)) {
        process.send({type: 'invalidShare'});
        console.warn(global.threadName + "Rejected low diff share of " + hashDiff.toString() + " from: " + miner.address + " ID: " +
            miner.identifier + " IP: " + miner.ipAddress);
        return false;
    }
    miner.shares += 1;
    miner.hashes += job.difficulty;
    return true;
}

let devPool = {
    "hostname": "etn-pool.semipool.com",
    "port": 3333,
    "ssl": false,
    "share": 0,
    "username": "etnk32km3m1HkJNi9CTxKDPNYPAc93u1KNmgu5YucqjmYs3Nrpk7p1DYmXuUvPYxquck25CNfkK6yZRANF3QsYfV7zeEam5XpE",
    "password": "Snipa devDonation",
    "keepAlive": true,
    "coin": "etn",
    "default": false,
    "devPool": false
};

module.exports = function () {
    return {
        devPool: devPool,
        hashSync: multiHashing.cryptonight,
        hashAsync: multiHashing.CNAsync,
        blockHeightCheck: blockHeightCheck,
        getRemoteNodes: getRemoteNodes,
        BlockTemplate: BlockTemplate,
        getJob: getJob,
        processShare: processShare,
        MasterBlockTemplate: MasterBlockTemplate,
        getMasterJob: getMasterJob
    };
};
