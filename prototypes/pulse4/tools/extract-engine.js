// pull the in-page engine out of the HTML and run it headless for an audio check
const fs=require("fs");
const path=require("path");
const html=fs.readFileSync(path.join(__dirname,"..","app","pulse4-pdp1.html"),"utf8");
const s=html.slice(html.indexOf("<script>")+8, html.indexOf("</script>"));
const start=s.indexOf("const W_LEN = 18;"), end=s.indexOf("/* ================= state ================= */");
const RIMB=s.slice(s.indexOf('const RIM_B64="'), s.indexOf('const TEMPERAMENTS='));
module.exports=eval("(function(){"+RIMB+s.slice(start,end)+
  ";return {PDP1,compileStream,loadStream,render,boot,retune,writeVariants,rimTape,TAB,CHM_FACTOR,RIM_B64};})()");
