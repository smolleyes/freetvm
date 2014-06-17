var http=require('http');
var path = require('path');
var fs = require('fs');
var temp = require('temp');
var execFile = require('child_process').exec;

var execDir;
var online_version;

$(document).ready(function(){
    try {
        http.get('http://sd-20470.dedibox.fr/freetvm/update.html',function(res,err){
            var datas = [];
            res.on('data',function(chunk){
                datas.push(chunk);
            });
            res.on('end',function(){
                var data = datas.join('');
                var txt = $('p',data).prevObject[1].innerHTML;
                online_version = txt;
                try {
					console.log("online version : "+online_version+', current version : '+ settings.version);
				} catch(err){
					console.log(err);
					return;
				}
                if (online_version === settings.version) {
                    $.notif({title: 'FreeTv-M:',cls:'success',icon: '&#10003;',content:"FreeTv-M est à jour !",btnId:'',btnTitle:'',btnColor:'',btnDisplay: 'none',updateDisplay:'none'});
                    
                } else {
                    $.notif({title: 'FreeTv-M:',cls:'error',icon: '&#59256;',timeout:0,content:"Une nouvelle version de freeTv-M est disponible !",btnId:'updateBtn',btnTitle:'Mise à jour',btnColor:'black',btnDisplay: 'block',updateDisplay:'none'})
                }
            });
        });
    } catch (err) {
        console.log("offline mode or update server down....");
    }
    
    // udpates
    $(document).on('click','#updateBtn',function(e) {
        e.preventDefault();
        var arch = process.arch;
        var file = '';
        var link = '';
        if (process.platform === 'win32') {
            file = 'freetvm-setup.exe';
            link = 'http://sd-20470.dedibox.fr/freetvm/windows/'+file;
		} else if (process.platform === 'darwin') {
			 file = 'freetvm-osx.zip';
			 link = 'http://sd-20470.dedibox.fr/freetvm/osx/'+file;
        } else {
            if (arch === 'ia32') {
                console.log('linux 32 bits detected...');
                file = 'freetvm-32.zip';
            } else if (arch === 'x64') {
                console.log('linux 64 bits detected...');
                file = 'freetvm-64.zip';
            }
            link = 'http://sd-20470.dedibox.fr/freetvm/'+file;
        }
        downloadUpdate(link,file);
    });
});

function downloadUpdate(link,filename) {
    $.notif({title: 'Mise à jour de FreeTv-M:',icon: '&#128229;',timeout:0,content:'',btnId:'',btnTitle:'',btnColor:'',btnDisplay: 'none',updateDisplay:'block'});
    // remove file if already exist
    var pbar = $('#updateProgress');
    execDir = path.dirname(process.execPath);
    // start download
    $('#updateProgress strong').html("En attente de connexion...");
    var val = $('#updateProgress progress').attr('value');
    var currentTime;
    var startTime = (new Date()).getTime();
    current_download = http.request(link,
    function (response) {
	var contentLength = response.headers["content-length"];
    if (parseInt(contentLength) === 0) {
		$('#updateProgress strong').html("Impossible de télécharger la mise à jour...");
		setTimeout(function(){pbar.hide()},5000);
    }
    temp.mkdir('freetvm', function(err, dirPath) {
	tmpPath = dirPath;
	var target;
	if (process.platform === 'win32') {
		target = dirPath+'\\'+filename;
	} else {
		target = dirPath+'/'+filename;
	}
	var file = fs.createWriteStream(target);
	response.on('data',function (chunk) {
		file.write(chunk);
		var bytesDone = file.bytesWritten;
		currentTime = (new Date()).getTime();
		var transfer_speed = (bytesDone / ( currentTime - startTime)).toFixed(2);
		var newVal= bytesDone*100/contentLength;
		var txt = Math.floor(newVal)+'% '+'effectué à'+' '+transfer_speed+' kb/s';
		$('#updateProgress progress').attr('value',newVal).text(txt);
		$('#updateProgress strong').html(txt);
	});
	response.on('end', function() {
	    file.end();
	    $('#updateProgress b').empty();
	    $('#updateProgress strong').html('Téléchargement terminé !');
	    $('#updateProgress progress').hide();
	    var execDir = path.dirname(process.execPath);
	    var update;
	    process.chdir(tmpPath);
	    $('#updateProgress strong').html('Installation de la mise à jour...');
	    
	    if (process.platform === 'win32') {
			var f = tmpPath.replace(/\\/g,"\\\\")+'\\\\freetvm-setup.exe';
			var exe = execFile(f); 
			setTimeout(function(){win.emit('close')},2000);
 	    } else if (process.platform === 'darwin') {
			var dest = path.dirname(execDir.match(/(.*)FreetvM-server.app(.*?)/)[0]);
		    var args = ['-o',filename,'-d',dest];
		    var update = spawn('unzip', args);
	    	update.on('exit', function(data){
		    	pbar.click();
		    	$('.notification').click();
		    	if (parseInt(data) == 0) {
			    	$.notif({title: 'freetvm:',cls:'green',timeout:10000,icon: '&#10003;',content:"Mise à jour installée avec succès! merci de relancer freeTv-M",btnId:'',btnTitle:'',btnColor:'',btnDisplay: 'none',updateDisplay:'none'});
		    	} else {
			    	$.notif({title: 'freetvm:',cls:'red',timeout:10000,icon: '&#10006;',content:"Erreur de mise à jour, merci de remonter le problème... essayez de reinstaller manuellement!",btnId:'',btnTitle:'',btnColor:'',btnDisplay: 'none',updateDisplay:'none'});
		    	}
	    	});
	    	update.stderr.on('data', function(data) {
		    	$('.notification').click();
		    	$.notif({title: 'freetvm:',cls:'red',timeout:10000,icon: '&#10006;',content:"Erreur de mise à jour, merci de remonter le problème... essayez de reinstaller manuellement!" + data,btnId:'',btnTitle:'',btnColor:'',btnDisplay: 'none',updateDisplay:'none'});
		    	console.log('update stderr: ' + data);
	    	});
 	    } else {
		    var args = ['-o',filename,'-d',execDir];
		    var update = spawn('unzip', args);
	    	update.on('exit', function(data){
		    	pbar.click();
		    	$('.notification').click();
		    	if (parseInt(data) == 0) {
			    	$.notif({title: 'freetvm:',cls:'green',timeout:10000,icon: '&#10003;',content:"Mise à jour installée avec succès! merci de relancer freeTv-M",btnId:'',btnTitle:'',btnColor:'',btnDisplay: 'none',updateDisplay:'none'});
		    	} else {
			    	$.notif({title: 'freetvm:',cls:'red',timeout:10000,icon: '&#10006;',content:"Erreur de mise à jour, merci de remonter le problème... essayez de reinstaller manuellement!",btnId:'',btnTitle:'',btnColor:'',btnDisplay: 'none',updateDisplay:'none'});
		    	}
	    	});
	    	update.stderr.on('data', function(data) {
		    	$('.notification').click();
		    	$.notif({title: 'freetvm:',cls:'red',timeout:10000,icon: '&#10006;',content:"Erreur de mise à jour, merci de remonter le problème... essayez de reinstaller manuellement!",btnId:'',btnTitle:'',btnColor:'',btnDisplay: 'none',updateDisplay:'none'});
		    	console.log('update stderr: ' + data);
	    	});
		}
	});
    });
});
current_download.end();
}
