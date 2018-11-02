import {logBlockchain} from "../../imports/startup/server/log-configuration";
import {getHttpGET, getHttpGETdata, getHttpPOST, getHttpPUT} from "../../server/api/http";
import {chai} from 'meteor/practicalmeteor:chai';
import {OptIns} from "../../imports/api/opt-ins/opt-ins";
const headers = { 'Content-Type':'text/plain'  };
import {quotedPrintableDecode} from "emailjs-mime-codec";
import {Meteor} from "meteor/meteor";
import {Recipients} from "../../imports/api/recipients/recipients";
import {generatetoaddress} from "./test-api-on-node";
var POP3Client = require("poplib");

export function login(url, paramsLogin, log) {
    if(log) logBlockchain('dApp login.');

    const urlLogin = url+'/api/v1/login';
    const headersLogin = [{'Content-Type':'application/json'}];
    const realDataLogin= { params: paramsLogin, headers: headersLogin };

    const result = getHttpPOST(urlLogin, realDataLogin);

    if(log) logBlockchain('result login:',result);
    const statusCode = result.statusCode;
    const dataLogin = result.data;

    const statusLogin = dataLogin.status;
    chai.assert.equal(200, statusCode);
    chai.assert.equal('success', statusLogin);
    return dataLogin.data;
}

export function requestDOI(url, auth, recipient_mail, sender_mail, data,  log) {
    if(log) logBlockchain('requestDOI called.');

    const urlOptIn = url+'/api/v1/opt-in';
    let dataOptIn = {};

    if(data){
        dataOptIn = {
            "recipient_mail":recipient_mail,
            "sender_mail":sender_mail,
            "data":JSON.stringify(data)
        }
    }else{
        dataOptIn = {
            "recipient_mail":recipient_mail,
            "sender_mail":sender_mail
        }
    }

    const headersOptIn = {
        'Content-Type':'application/json',
        'X-User-Id':auth.userId,
        'X-Auth-Token':auth.authToken
    };

    const realDataOptIn = { data: dataOptIn, headers: headersOptIn};
    const resultOptIn = getHttpPOST(urlOptIn, realDataOptIn);

    if(log) logBlockchain("resultOptIn",resultOptIn);
    chai.assert.equal(200, resultOptIn.statusCode);
    chai.assert.equal('success',  resultOptIn.data.status);
    return resultOptIn.data;
}



export function getNameIdOfRawTransaction(url, auth, txId){

    const dataGetRawTransaction = {"jsonrpc": "1.0", "id":"getrawtransaction", "method": "getrawtransaction", "params": [txId,1] };
    const realdataGetRawTransaction = { auth: auth, data: dataGetRawTransaction, headers: headers };
    const resultGetRawTransaction = getHttpPOST(url, realdataGetRawTransaction);
    let nameId;
    if(resultGetRawTransaction.data.result.vout[1].scriptPubKey.nameOp!==undefined){
        nameId = resultGetRawTransaction.data.result.vout[1].scriptPubKey.nameOp.name;
    }
    else{
        nameId = resultGetRawTransaction.data.result.vout[0].scriptPubKey.nameOp.name;
    }
    chai.assert.equal(txId, resultGetRawTransaction.data.result.txid);
    return nameId;
}

export function getNameIdOfOptInFromRawTx(url, auth, optInId, log){

        const our_optIn = OptIns.findOne({_id: optInId});
        chai.assert.equal(our_optIn._id,optInId);

        if(log) logBlockchain('optIn:',our_optIn);
        const nameId = getNameIdOfRawTransaction(url,auth,our_optIn.txId);
        chai.assert.equal("e/"+our_optIn.nameId, nameId);

        if(log) logBlockchain('nameId:',nameId);
        chai.expect(nameId).to.not.be.null;
        return nameId;
}

export function fetchConfirmLinkFromPop3Mail(hostname,port,username,password,alicedapp_url,log) {
    const syncFunc = Meteor.wrapAsync(fetch_confirm_link_from_pop3_mail);
    return syncFunc(hostname,port,username,password,alicedapp_url,log);
}

function fetch_confirm_link_from_pop3_mail(hostname,port,username,password,alicedapp_url,log,callback) {

    if(log)logBlockchain("logging bob into pop3 server");
    //https://github.com/ditesh/node-poplib/blob/master/demos/retrieve-all.js
    var client = new POP3Client(port, hostname, {
        tlserrs: false,
        enabletls: false,
        debug: true
    });

    client.on("connect", function() {
        if(log) logBlockchain("CONNECT success",'');
        client.login(username, password);
        client.on("login", function(status, rawdata) {
            if (status) {
                if(log) logBlockchain("LOGIN/PASS success",'');
                client.list();

                client.on("list", function(status, msgcount, msgnumber, data, rawdata) {

                    if (status === false) {
                        const err = "LIST failed"+ msgnumber;
                        client.rset();
                        callback(err, null);
                        return;
                    } else {
                        if(log) logBlockchain("LIST success with " + msgcount + " element(s)",'');

                        chai.expect(msgcount).to.be.above(0, 'no email in bobs inbox');
                        if (msgcount > 0){
                            client.retr(1);
                            client.on("retr", function(status, msgnumber, maildata, rawdata) {

                                if (status === true) {
                                    if(log) logBlockchain("RETR success " + msgnumber);

                                    //https://github.com/emailjs/emailjs-mime-codec
                                    const html  = quotedPrintableDecode(maildata);
                                    const linkdata =  html.substring(html.indexOf(alicedapp_url),html.indexOf("'",html.indexOf(alicedapp_url)));
                                    chai.expect(linkdata).to.not.be.null;
                                    client.dele(msgnumber);
                                    client.on("dele", function(status, msgnumber, data, rawdata) {
                                        client.quit();
                                        client.end();
                                        client = null;
                                        callback(null,linkdata);
                                    });

                                } else {
                                    const err = "RETR failed for msgnumber "+ msgnumber;
                                    client.rset();
                                    client.end();
                                    client = null;
                                    callback(err, null);
                                    return;
                                }
                            });
                        }
                        else{
                            const err = "empty mailbox";
                            callback(err, null);
                            client.quit();
                            client.end();
                            client = null;
                            return;
                        }
                    }
                });

            } else {
                const err = "LOGIN/PASS failed";
                callback(err, null);
                client.quit();
                client.end();
                client = null;
                return;
            }
        });
    });
}

export function confirmLink(confirmLink){
    logBlockchain("clickable link:",confirmLink);
    const doiConfirmlinkResult = getHttpGET(confirmLink,'');

    chai.expect(doiConfirmlinkResult.content).to.have.string('ANMELDUNG ERFOLGREICH');
    chai.expect(doiConfirmlinkResult.content).to.have.string('Vielen Dank für Ihre Anmeldung');
    chai.expect(doiConfirmlinkResult.content).to.have.string('Ihre Anmeldung war erfolgreich.');
    chai.assert.equal(200, doiConfirmlinkResult.statusCode);
}

export function verifyDOI(dAppUrl, sender_mail, recipient_mail,nameId, auth, log ){
    const urlVerify = dAppUrl+'/api/v1/opt-in/verify';
    const recipient_public_key = Recipients.findOne({email: recipient_mail}).publicKey;

    const dataVerify = {
        recipient_mail: recipient_mail,
        sender_mail: sender_mail,
        name_id: nameId,
        recipient_public_key: recipient_public_key
    };

    const headersVerify = {
        'Content-Type':'application/json',
        'X-User-Id':auth.userId,
        'X-Auth-Token':auth.authToken
    };

    if(log) logBlockchain('verifying opt-in:', {auth:auth, data:dataVerify,url:urlVerify});
    const realdataVerify = { data: dataVerify, headers: headersVerify };
    const resultVerify = getHttpGETdata(urlVerify, realdataVerify);

    if(log) logBlockchain('result /opt-in/verify:', resultVerify);
    const statusVerify = resultVerify.statusCode;
    chai.assert.equal(200, statusVerify);
    chai.assert.equal(true, resultVerify.data.data.val);
}

export function createUser(url,auth,username,templateURL,log){
    const headersUser = {
        'Content-Type':'application/json',
        'X-User-Id':auth.userId,
        'X-Auth-Token':auth.authToken
    }
    const mailTemplate = {
        "subject": "Hello i am "+username,
        "redirect": "http://"+username+".com",
        "returnPath":  username+"@email.com",
        "templateURL": templateURL
    }
    const urlUsers = url+'/api/v1/users';
    const dataUser = {"username":username,"email":username+"@email.com","password":"password","mailTemplate":mailTemplate}

    const realDataUser= { data: dataUser, headers: headersUser};
    if(log) logBlockchain('createUser:', realDataUser);
    let res = getHttpPOST(urlUsers,realDataUser);
    if(log) logBlockchain("response",res);
    chai.assert.equal(200, res.statusCode);
    chai.assert.equal(res.data.status,"success");
    return res.data.data.userid;
}

export function findUser(userId){
    const res = Accounts.users.findOne({_id:userId});
    chai.expect(res).to.not.be.undefined;
    return res;
}

export function findOptIn(optInId,log){
    const res = OptIns.findOne({_id:optInId});
    if(log)logBlockchain(res,optInId);
    chai.expect(res).to.not.be.undefined;
    return res;
}

export function exportOptIns(url,auth,log){
    const headersUser = {
        'Content-Type':'application/json',
        'X-User-Id':auth.userId,
        'X-Auth-Token':auth.authToken
    };

    const urlExport = url+'/api/v1/export';
    const realDataUser= {headers: headersUser};
    let res = getHttpGETdata(urlExport,realDataUser);
    if(log) logBlockchain(res,log);
    chai.assert.equal(200, res.statusCode);
    chai.assert.equal(res.data.status,"success");
    return res.data.data;
}

export function requestConfirmVerifyBasicDoi(node_url_alice,rpcAuthAlice, dappUrlAlice,dataLoginAlice,dappUrlBob,recipient_mail,sender_mail,optionalData,recipient_pop3username, recipient_pop3password, log) {
    const syncFunc = Meteor.wrapAsync(request_confirm_verify_basic_doi);
    return syncFunc(node_url_alice,rpcAuthAlice, dappUrlAlice,dataLoginAlice,dappUrlBob, recipient_mail,sender_mail,optionalData,recipient_pop3username, recipient_pop3password, log);
}

function request_confirm_verify_basic_doi(node_url_alice,rpcAuthAlice, dappUrlAlice,dataLoginAlice, dappUrlBob, recipient_mail,sender_mail,optionalData,recipient_pop3username, recipient_pop3password, log, callback) {
    const resultDataOptIn = requestDOI(dappUrlAlice, dataLoginAlice, recipient_mail, sender_mail, optionalData, false);
    if (log) logBlockchain('waiting seconds before get NameIdOfOptIn', 10);
    setTimeout(Meteor.bindEnvironment(function () {

        const nameId = getNameIdOfOptInFromRawTx(node_url_alice, rpcAuthAlice, resultDataOptIn.data.id, true);

        if (log) logBlockchain('waiting seconds before fetching email:', 10);
        setTimeout(Meteor.bindEnvironment(function () {

            const link2Confirm = fetchConfirmLinkFromPop3Mail("mail", 110, recipient_pop3username, recipient_pop3password, dappUrlBob, false);
            confirmLink(link2Confirm);
            generatetoaddress(node_url_alice, rpcAuthAlice, global.aliceAddress, 1, false);

            if (log) logBlockchain('waiting 10 seconds to update blockchain before generating another block:');
            setTimeout(Meteor.bindEnvironment(function () {
                generatetoaddress(node_url_alice, rpcAuthAlice, global.aliceAddress, 1, false);

                if (log) logBlockchain('waiting 10 seconds before verifying DOI on alice:');
                setTimeout(Meteor.bindEnvironment(function () {
                    verifyDOI(dappUrlAlice, sender_mail, recipient_mail, nameId, dataLoginAlice, log); //need to generate two blocks to make block visible on alice
                    // done();
                    callback(null, {optIn: resultDataOptIn, nameId: nameId});
                }), 10000); //verify
            }), 10000); //verify
        }), 16000); //connect to pop3
    }), 10000); //find transaction on bob's node - even the block is not confirmed yet
}

export function updateUser(url,auth,updateId,templateURL,log){
    
    const headersUser = {
        'Content-Type':'application/json',
        'X-User-Id':auth.userId,
        'X-Auth-Token':auth.authToken
    }

    const mailTemplate = {'templateURL': templateURL};
    const dataUser = {"mailTemplate":mailTemplate};
    if(log) logBlockchain('url:', url);
    const urlUsers = url+'/api/v1/users/'+updateId;
    const realDataUser= { data: dataUser, headers: headersUser};
    if(log) logBlockchain('updateUser:', realDataUser);
    let res = HTTP.put(urlUsers,realDataUser);
    if(log) logBlockchain("response",res);
    chai.assert.equal(200, res.statusCode);
    chai.assert.equal(res.data.status,"success");
    const usDat = Accounts.users.findOne({_id:updateId}).profile.mailTemplate;
    if(log) logBlockchain("InputTemplate",dataUser.mailTemplate);
    if(log) logBlockchain("ResultTemplate",usDat);
    chai.expect(usDat).to.not.be.undefined;
    chai.assert.equal(dataUser.mailTemplate.templateURL,usDat.templateURL);
    return usDat;
}

export function resetUsers(){
    Accounts.users.remove(
        {"username":
        {"$ne":"admin"}
        }
    );
}