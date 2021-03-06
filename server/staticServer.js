/**
 * 静态服务器
 * Created by likaituan on 15/8/26.
 */

~function(req, exp) {
    "use strict";
	var fs = req("fs");
    var mime = req("./mime");
	var tp = req("../core/template");
    var pk = require("../package.json");
    var zlib = require('zlib');

    exp.items = [];
	exp.model = null;       //模型
    var ops;

    //初始化
    exp.init = function(_ops){
        ops = _ops;
        var config = ops.static;
        if(typeof config=="string"){
            config = {
                path: "/",
                dir: config
            };
        }
        (config.items || [config]).forEach(function (item) {
            //先赋值公用属性
            for (var k in config) {
                if (k !== "items" && item.hasOwnProperty(k)===false) {
                    item[k] = config[k];
                }
            }
            item.path = item.path || "/";
            item.dir = (item.dir||"").replace(/\/$/,"");
            if (item.file) {
                item.code = fs.readFileSync(item.file).toString();
            }
            exp.items.push(item);
        });
    };

	//未做缓存
    exp.parse = function (Req, Res,item) {
        //单文件匹配(缓存)
        if(item.code){
            Res.writeHead(200, {'Content-Type': 'text/html'});
            Res.end(item.code);
            return;
        }

        var re = new RegExp("^"+item.path,"i");
        var file = decodeURI(Req.url).replace(/\?.*$/,"").replace(re, "");
        if (file == item.path || (file+"/") == item.path) {
            file = "index.html";
        }

        var ext = file.split(".").slice(-1)[0] || "txt";
        var mimeType = mime[ext] || "text/plain";
        var isGzip = ops.gzip && /^(?:js|css|html|txt|json)$/i.test(ext);

        /*
         var encode = /^image\/|^audio\//.test(mimeType) ? 'binary' : 'utf-8';
        fs.readFile(item.dir + file, encode, function (err, data) {
            if (err) {
                Res.writeHead(404, {'Content-Type': 'text/plain'});
                Res.end("file is not found!");
            } else {
                Res.writeHead(200, {'Content-Type': ext});
                if(file=="index.html" && exp.model){
                    data = tp.compile(data)(exp.model);
                }
                Res.write(data, encode);
                Res.end();
            }
        });
        */

        var res_headers = {};
        res_headers["Server"] = `${pk.name}/${pk.version}`;
        
        var fullFile = `${item.dir}/${file}`;
        var existFile = fs.existsSync(fullFile);
        if(existFile) {
            var gzipStream = zlib.createGzip();
            res_headers["Content-Type"] = `${mimeType};charset=utf-8`;
            var stream = fs.createReadStream(fullFile);
            if(file.endsWith(".mp3")){
                var byteLen = fs.statSync(fullFile).size;
                res_headers["Content-Range"] = `bytes 0-${byteLen-1}/${byteLen}`;
            }
            if (isGzip) {
                res_headers["Content-Encoding"] = "gzip";
                Res.writeHead(200, res_headers);
                stream.pipe(gzipStream).pipe(Res);
            } else {
                Res.writeHead(200, res_headers);
                stream.pipe(Res);
            }
        }else {
            res_headers["Content-Type"] = "text/plain;charset=utf-8";
            Res.writeHead(404, res_headers);
            Res.end("file is not found!");
        }

    };
}(require, exports);
