#!/usr/bin/env node

var fs = require("fs");
var os = require("os");
var cp = require("child_process");
var server = require("../http/core");
var ex = require("../core/ex");
var pk = require("../package.json");

var currentOs = os.platform();
var argv = process.argv.slice(2);
var cmd = argv.shift();

var hasPath = false;
var args = {};
args.ip = ex.getIp();
argv.forEach(function(kv){
    kv = kv.split("=");
    var k = kv[0];
    var v = kv[1];
    if(kv.length==2){
        args[k] = v;
    }else{
        args[k] = true;
    }
});

var currentPath = process.cwd() + "/";
var configFile = `${currentPath}${pk.name}.config.js`;
var config = {};
var hasFile = fs.existsSync(configFile);
if(hasFile) {
	config = require(configFile);
    if(typeof config=="function"){
        config = config(args);
    }
}

//启动
if(cmd=="start") {
	if(hasFile) {
       	if(config.static){
			hasPath = true;
			if(config.static.items) {
				config.static.items.forEach(server.addStatic);
			}else{
				server.addStatic(config.static);
			}
		}
        if(config.remote){
			hasPath = true;
            if(config.remote.items) {
                config.remote.items.forEach(function(item) {
                    for(var k in config.remote) {
                        if(k!=="items" && item[k]===undefined) {
                            item[k] = config.remote[k];
                        }
                    }
                    server.addRemote(item);
                });
            }else{
                server.addRemote(config.remote);
            }
		}
		if(config.db){
			hasPath = true;
			server.addDb(config.db);
		}

        server.crossDomain = config.crossDomain;
        server.startTip = config.startTip;
        server.port = config.port;
        server.start();
    }else if (args.path) {
		hasPath = true;
        if(args.seekjs){
            server.addStatic({
                path: "/seekjs/",
                dir: args.seekjs
            });
        }
        server.addStatic({
            path: "/",
            dir: args.path
        });
        server.port = args.port || 80;
        server.start();
	}

	if(hasPath) {
        args.open && cp.execSync('open http://localhost:' + server.port);
    }else{
		console.log(`sorry, please set path parameter or setting a '${pk.name}.config.js' file on current directory!`);
	}

//更新
}else if(cmd=="update") {
	console.log("now is updating, please wait a moment...");
    var updateCmd = currentOs=="win32" ? `npm update -g ${pk.name}` : `sudo npm update -g ${pk.name}`;
	cp.exec(updateCmd, function callback(error, stdout, stderr) {
		console.log(stdout);
	});

//查看版本
}else if(cmd=="-v"){
    console.log(pk.version);

//登陆
}else if(cmd=="login"){
	var env = argv[0];
	if(env) {
        var pub = config.pub;
        if(pub && pub.env) {
            var ip = pub.env[env].ip;
            var pw = args.password || pub.password && pub.password[env];
            if(pw) {
                cp.execSync(`sshpass -p ${pw} ssh -T root@${ip}`);
            }else{
                cp.execSync(`ssh -t -t root@${ip}`);
            }
        }else{
            console.log("please setting publish option before!");
        }
	}else{
		console.log("please select a environment before!");
	}

//发版
}else if(cmd=="pub"){
    args.env = argv[0];
    if(args.env) {
        if(args.env=="init") {
            console.log("sorry, environment name cannot named 'init'!");
        }else{
            var ops = typeof(config.pub)=="function" ? config.pub(args) : config.pub;

            var ip = ops.remoteIp;
            var dir = ops.remoteDir;
            if (ip && dir) {
                var user = ops.remoteUser || "root";
                var port = ops.remotePort || config.port;
                if (args.init) {
                    var pubScript = __dirname + "/pub.sh";
                    cp.execSync(`scp -p ${pubScript} ${user}@${ip}:${dir}/pub.sh`);
                    console.log("publish init success!");
                } else {
                    config.publishBefore && config.publishBefore(args);
                    var tarFile = `${ops.tarPath}/${ops.tarFile}`;

                    var text1 = cp.execSync(`tar -zcf ${tarFile} ${ops.tarSource}`).toString();
                    console.log(text1);
                    var text2 = cp.execSync(`scp ${tarFile} ${user}@${ip}:${dir}/bin.tar.gz`).toString();
                    console.log(text2);
                    var text3 = cp.execSync(`ssh ${user}@${ip} "sh ${dir}/pub.sh ${port}"`).toString();
                    console.log(text3);
                }
            } else {
                console.log("please setting publish option before!");
            }
        }
    }else{
        console.log("please select a environment before!");
    }

}else{
    console.log(`welcome to ${pk.name}, ${pk.name} current version is ${pk.version}!`);
}