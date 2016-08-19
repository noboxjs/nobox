/**
 * 远程动态服务器
 * Created by likaituan on 15/8/26.
 */

~function(req, exp) {
    "use strict";
	var fs = req("fs");
	var qs = req("querystring");
	var http = req("http");

    var _params = req("./params");

	var ex = req("../core/ex");
    var pk = require("../package.json");
    var str = req("../core/string");
    var date = req("../core/date");
    var val = req("../validate/validate");

    exp.items = {};
    exp.serviceList = {};

    //初始化
    exp.init = function (config, db) {
        config = config || {};
        config.items = config.items || [config];
        if(db){
            db.type = "mongodb";
            config.items.push(db);
        }
        config.items.forEach(function (item) {
            for (var k in config) {
                if (k !== "items" && item[k] === undefined) {
                    item[k] = config[k];
                }
            }
            if(item.path) {
                exp.items[item.path] = item;
            }
        });

        //添加到映射表
        for(var p in exp.items) {
            var item = exp.items[p];
            if(item.validate){
                if(!item.validate.rule) {
                    item.validate = {rule: item.validate};
                }
                if(item.validate.lang) {
                    if(item.validate.langFile){
                        val.tip = item.validate.langFile;
                    }else {
                        val.tip = val.tips[item.validate.lang];
                    }
                }
            }else{
                item.validate = {};
            }

            if (item.dir) {
                var o = exp.serviceList[p] = {};
                fs.readdirSync(item.dir).forEach(function(fileName){
                    var key = fileName.split(".")[0];
                    o[key] = require(item.dir + key);
                });
            } else if (item.file) {
                exp.serviceList[p] = item.file;
            }
        }
	};

    //报错处理
    var Error = function(err){
        console.log(err);
        err.code == "EADDRINUSE" && console.log("服务器地址及端口已被占用");
        err && err.stack && console.log(err.stack);
    };

	//转发远程
    exp.parse = function (Req, Res, item) {
        var resJson = {};
        resJson["Content-Type"] = "text/html;charset=utf-8";
        resJson["Server"] = `${pk.name}/${pk.version}`;
        if(item.crossDomain){
            resJson["Access-Control-Allow-Origin"] = item.crossDomain;
            resJson["Access-Control-Allow-Credentials"] = false;
            //resJson["Access-Control-Allow-Headers"] = "userId,sessionId";//"X-Custom-Header";//"X-Requested-With";
            resJson["Access-Control-Allow-Headers"] = "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept";
            if(item.headerKeys){
                resJson["Access-Control-Allow-Headers"] += "," + item.headerKeys.join(",");
            }
            resJson["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";//"PUT,POST,GET,DELETE,OPTIONS";
        }
        Res.writeHead(200,resJson);
        if(Req.method=="OPTIONS"){
            //console.log("send=",Res.send);
            //Res.send(200);
            //global.httpx.abort();
            Res.end();
            //Res.end('{"code":-99,"message":"取不到数据"}');
            return;
        }

        var re = new RegExp("^"+item.path,"i");
        //var url = Req.url.replace(re, "").split("/");
        var url = Req.url.replace(re, "").replace(/\?.*$/,"").split("/");
        var serviceList = exp.serviceList[item.path];
        var file = item.dir ? url.shift() : null;
		var method = url.join("/");
        (function () {
			var fun;
			if(item.dir){
				fun = serviceList[file];
				if(typeof(fun)!="object"){
					console.log("service [ "+file+" ] 文件不存在");
					Res.end('{"code":500}');
					return;
				}
				fun = fun[method];
			}else if(item.file){
				fun = serviceList[method];
			}
            if(typeof(fun)!="function"){
                console.log("service [ "+method+" ] 方法不存在");
                Res.end('{"code":500}');
                return;
            }
            _params.getParams(Req, Res, function (srcParams) {
                console.log("p=",srcParams);
                //空格过滤
                var params = {};
                for(var k in srcParams) {
                    params[k] = typeof(srcParams[k])=="string" ? srcParams[k].trim() : srcParams[k];
                }
                //console.log(Req.headers);
                exp.session = {};
                (item.headerKeys||[]).forEach(function(key){
                    var v = Req.headers[key.toLowerCase()];
                    exp.session[key] = v=="undefined" ? undefined : v;
                });
                //针对mongodb
                if(exp.db && item.type=="mongodb"){
                    fun({
                        params: params,
                        session: exp.session,
                        db: exp.db,
                        ip: exp.getClientIp(Req)
                    }, function(ret){
                        ret.code = ret.code || 0;
                        Res.end(JSON.stringify({
                            success: ret.code==0,
                            code: ret.code,
                            data: ret.data || {},
                            message: ret.message || ""
                        }));
                    });
                    return;
                }
                if(item.type=="binary"){
                    fun({
                        params: params,
                        session: exp.session
                    }, function(data){
                        var stream = data.stream || data.filename && fs.createReadStream(data.filename);
                        if(stream) {
                            var headJson = {
                                "Content-Type": "application/octet-stream;charset=utf-8"
                            };
                            if(data.filename){
                                var suffix = /\.\w+$/.test(data.filename) && RegExp.lastMatch || "";
                                headJson["Content-Disposition"] = `attachment;filename=${Date.now()}${suffix}`;
                            }
                            Res.writeHead(200, headJson);

                            stream.pipe(Res);
                        }else{
                            Res.writeHead(404, {"Content-Type": "text/plain;charset=utf-8"});
                            Res.end();
                        }
                    });
                    return;
                }

                var ops = fun(params, exp.session);
                if(typeof(ops)=="object" && ops.url) {
                    ops.url = str.format(ops.url, params); //地址栏格式化
                    //抛出表单检查的bug
                    try {
                        if(item.dataKeys){
                            //item.dataKeys.forEach( key => params[key]=exp.session[key] );
                            item.dataKeys.forEach(function(key){
                                ops.data[key] = exp.session[key];
                            });
                        }
                        exp.chkForm(params, ops.chk, Res, item) && exp.send(ops, item, Req, Res);
                        //exp.send(ops, item, Req, Res);
                    } catch (e) {
                        Error(e);
                        console.log("未知的异常错误");
                        Res.end('{"code":500}');
                    }
                }else{
					/*
					if(typeof(ops)=="object"){
						Res.end(JSON.stringify(ops));
					}else{
						Res.end(ops);
					}
					*/
					Res.end(JSON.stringify({
						success: true,
						code:0,
						data: ops
					}));
                }
            });
        })();
    };

    //获取客户端IP
    //代码，第一段判断是否有反向代理IP(头信息：x-forwarded-for)，在判断connection的远程IP，以及后端的socket的IP
    exp.getClientIp = function (req) {
        return req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress;
    };

    //表单检查
    exp.chkForm = function (params, chk_params, Res, item) {
        var ret = val.chk(params, chk_params, item.validate.rule);
        if (ret === true) {
            if (params.hasOwnProperty("is_submit") && params.is_submit == 0) {
                Res.end('{"code":0}');
                return false;
            }
        } else {
            var [key, message] = ret;
            message = (item.validate.prefix||"") + message + (item.validate.suffix||"");
            Res.end(JSON.stringify({code: -3, message:message, key:key }));
            return false;
        }
        return true;
    };

    //转发请求
    exp.send = function (ops, item, Req, Res) {

        var contentType = item.contentType || "x-www-form-urlencoded";
        var uriData = qs.stringify(ops.data);
        var jsonData = JSON.stringify(ops.data);
        var data = contentType=="json" ? jsonData : uriData;
        var PATH = (item.prefix||"") + ops.url;

        var url = {
            host: item.host,
            port: item.port,
            path: PATH,
            method: ops.type,
            headers: {
                //"Cookie": Req.headers.cookie || "",
                "Content-Type": "application/"+contentType+"; charset=UTF-8"
                //,"Content-Length": data.replace(/[^\x00-\xff]/g,"aa").length
                //,"Content-Length": data.length
            }
        };
        for(var key in exp.session){
            url.headers[key] = exp.session[key] || "";
        }

        if (ops.type.toLowerCase() == "get") {
            //url = "http://" + url.host + ":" + url.port + url.path;
            url.path += "?" + uriData;
            data = "";
            url.headers["Content-Length"] = 0;
        }
        console.log("\n=============== Service Info ================");
        console.log("TIME: "+date.now());
        console.log("TYPE: " + ops.type);
        console.log("URL: " + url.host+":"+url.port);
        console.log("PATH: " + PATH);
        console.log("DATA: " + data.replace(/(password\w*=)\w+/ig,"$1******"));
        var req = http.request(url, function (res) {
            console.log('STATUS: ' + res.statusCode);
            var body = "";
            res.on('data', function (chunk) {
                body += chunk;
            }).on("end", function () {
                exp.parseResult(body,Res,item,ops);
            }).on('error', function (e) {
                Res.end(JSON.stringify({code: res.statusCode, msg: e.message}));
            });
        });
        req.on('error', function (err) {
            if(err.code=="ECONNREFUSED"){
                console.log("连接JAVA被拒绝.........");
            }else{
                console.log("远程服务器出错, 错误代码是: "+err.code+".................");
            }
            Res.end('{"code":500}');
        });
        req.write(data);
        //req.write(data + "\n");
        req.end();
    };

    //处理返回结果
    exp.parseResult = function (body,Res,item,ops) {
        var jsonObj = {};
        try {
            jsonObj = JSON.parse(body);
            console.log("RESULT: "+JSON.stringify(jsonObj,null,4));
        } catch (e) {
            console.log("RESULT: "+body);
            Res.end('{"code":500}');
            return;
        }
        if(item.getResult){
            jsonObj = item.getResult(jsonObj);
        }
        if(ops.res){
            jsonObj = ops.res(jsonObj);
        }
        var jsonStr = JSON.stringify(jsonObj);
        Res.end(jsonStr);
    };



}(require, exports);