#!/usr/bin/env node

global.log = console.log;

var {getIp} = require("../core/ex");
var {name,version} = require("../package.json");

var ua = {};
ua.engine = {name,version};
ua.ip = getIp();
ua.path = process.cwd();
ua.user = process.env.USER || process.env.USERNAME;
ua.sudo = process.platform!="win32"&&ua.user!="root" ? "sudo " : "";
ua.npm = process.platform=="win32" ? "npm.cmd" : "npm";

var cmdList = require("./cmdList");             //命令列表
cmdList.start = require("./start");             //启动
cmdList.pub = require("./pub");                 //发版
cmdList.deploy = require("./deploy");           //服务端部署

var cmd = process.argv.slice(2).shift();

//查看版本
if(cmd=="-v" || cmd=="--version"){
    log(version);
//命令
}else if(cmdList[cmd]){
    cmdList[cmd](ua);
//错误命令
}else if(cmd) {
    log(`unknown command "${cmd}"!`);
//默认
}else{
    log(`welcome to ${ua.engine.name}, ${ua.engine.name} current version is ${ua.engine.version}!`);
}