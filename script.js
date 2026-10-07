// 時間と乗換情報は、2026年9月14日（月）朝8時ごろの調査結果。
const data = window.MAP_DATA;
const destinationNames = {hakusan:'白山',honkomagome:'本駒込'};
let selectedDestinationId = 'hakusan';
let selectedStationName = '池袋';
const stationLayer = document.querySelector('.station-layer');
const select = document.getElementById('station-select');
const routeGroup = document.getElementById('active-route');
const mapLines = document.getElementById('map-lines');
const mapRegion = document.querySelector('.map-region');
Object.assign(mapLines.style,{left:`${data.image.x/1352*100}%`,top:`${data.image.y/1080*100}%`,width:`${data.image.width/1352*100}%`,height:`${data.image.height/1080*100}%`});
const position = name => {
 const s=data.stations.find(s=>s.name===name);
 return s ? [s.x+s.width/2,s.y+s.height/2] : null;
};

// 経路ごとに登録した路線と乗換地点をもとに、強調する経路を生成する。
const findRoutePath=window.RouteEngine.createRouteFinder({...data,stations:data.stations.map(s=>({...s,id:s.name}))});
// 駅名が2つ並ぶ、歩いて乗り換える駅の組。
const walkingTransfers=new Set(['板橋・新板橋','後楽園・春日','春日・後楽園','小川町・淡路町','東日本橋・馬喰横山','馬喰町・馬喰横山','有楽町・日比谷','田町・三田']);
const plainStationName=name=>name.replace('ツ','');
function transferStationNames(journey){
 if(!journey.transfers||!journey.transferStations)return [];
 const names=journey.transferStations.split('・');
 const groups=[];
 for(let i=0;i<names.length;i++){
  const pair=`${names[i]}・${names[i+1]}`;
  if(walkingTransfers.has(pair)){groups.push(pair);i++;}
  else groups.push(names[i]);
 }
 return groups;
}
// 乗換駅名を、ほかの駅ラベルや印と重ならない向きに置く。
function placeTransferLabel(label){
 const bounds=mapRegion.getBoundingClientRect();
 const others=[...stationLayer.querySelectorAll('.station-label'),...routeGroup.querySelectorAll('.route-marker')].filter(o=>o!==label).map(o=>o.getBoundingClientRect());
 let best={side:'above',gap:'1.7cqh',overlap:Infinity};
 for(const gap of ['1.7cqh','3.4cqh','5.1cqh','6.8cqh']){
  label.style.setProperty('--transfer-gap',gap);
  for(const side of ['above','below','right','left','above-right','above-left','below-right','below-left']){
   label.dataset.side=side;
   const r=label.getBoundingClientRect();
   if(r.left<bounds.left||r.right>bounds.right||r.top<bounds.top||r.bottom>bounds.bottom)continue;
   const overlap=others.reduce((sum,o)=>sum+Math.max(0,Math.min(r.right,o.right)-Math.max(r.left,o.left))*Math.max(0,Math.min(r.bottom,o.bottom)-Math.max(r.top,o.top)),0);
   if(overlap<best.overlap)best={side,gap,overlap};
  }
 }
 label.dataset.side=best.side;
 label.style.setProperty('--transfer-gap',best.gap);
}
// 駅ラベルの位置を、路線図の座標（1352×1080）で返す。
function stationLabelBoxes(){
 const bounds=mapRegion.getBoundingClientRect();
 const scale=1352/bounds.width;
 return [...stationLayer.querySelectorAll('.station-label')].map(label=>{
  const r=label.getBoundingClientRect();
  return {left:(r.left-bounds.left)*scale,right:(r.right-bounds.left)*scale,top:(r.top-bounds.top)*scale,bottom:(r.bottom-bounds.top)*scale};
 });
}
// 乗換地点の印が駅ラベルに隠れるときは、経路に沿ってラベルの外までずらす。
function markClearOfLabels(mark,routePoints,boxes){
 const margin=15;
 const isClear=p=>!boxes.some(b=>p.x>b.left-margin&&p.x<b.right+margin&&p.y>b.top-margin&&p.y<b.bottom+margin);
 if(isClear(mark))return mark;
 const distanceTo=p=>Math.hypot(p.x-mark.x,p.y-mark.y);
 const nearest=routePoints.slice(Math.max(0,mark.order-40),mark.order+40).filter(isClear).sort((a,b)=>distanceTo(a)-distanceTo(b))[0];
 return nearest?{...mark,x:nearest.x,y:nearest.y}:mark;
}
function updateTravelDisplay(){
 const record=data.times[selectedStationName];
 const time=record?.[selectedDestinationId];
 const journey=data.journeys?.[selectedStationName]?.[selectedDestinationId];
 const stationText=document.getElementById('travel-station');
 stationText.textContent=selectedStationName;
 stationText.style.fontSize=`${Math.min(11.1111,24.6/Array.from(selectedStationName).length)}cqh`;
 document.getElementById('travel-destination').textContent=destinationNames[selectedDestinationId];
 const timeNumber=document.getElementById('travel-time-number');
 timeNumber.textContent=time??'—';
 const timeDigits=Array.from(String(time??''));
 timeNumber.classList.toggle('is-single-digit',timeDigits.length===1);
 timeNumber.classList.toggle('is-wide-number',timeDigits.length>1&&timeDigits[0]!=='1');
 document.querySelector('.time-line').classList.toggle('is-unregistered',time===undefined);
 document.getElementById('travel-status').textContent=time===undefined?'この駅の所要時間は未登録です':'';
 document.querySelectorAll('.station-label').forEach(b=>{
  const active=b.dataset.destination?b.dataset.destination===selectedDestinationId:b.dataset.name===selectedStationName;
  b.classList.toggle('is-selected',active);b.setAttribute('aria-pressed',String(active));
 });
 routeGroup.replaceChildren();
 stationLayer.querySelectorAll('.transfer-name').forEach(label=>label.remove());
 stationLayer.querySelectorAll('.is-transfer').forEach(label=>label.classList.remove('is-transfer'));
 const transferMarks=[];
 const routePoints=journey?findRoutePath(selectedStationName,destinationNames[selectedDestinationId],journey.lines,journey.transferPoints,journey.originPoint):[];
 if(routePoints.length>1){
  const pathData=routePoints.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');
  for(const className of ['route-path-halo','route-path','route-path-sparkle']){
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');
   path.setAttribute('class',className);path.setAttribute('data-route','registered');path.setAttribute('d',pathData);
   path.setAttribute('pathLength','100');
   routeGroup.appendChild(path);
  }
  // 乗換地点を経路の順に集める。
  for(let i=1;i<routePoints.length;i++){
   if(routePoints[i].transferFromPrevious){
    transferMarks.push({x:(routePoints[i-1].x+routePoints[i].x)/2,y:(routePoints[i-1].y+routePoints[i].y)/2,kind:'transfer',order:i});
   }
  }
  for(const [x,y] of journey.extraTransferPoints??[]){
   const distanceTo=p=>Math.hypot(p.x-x,p.y-y);
   const order=routePoints.reduce((nearest,p,i)=>distanceTo(p)<distanceTo(routePoints[nearest])?i:nearest,0);
   transferMarks.push({x,y,kind:'transfer',order});
  }
  transferMarks.sort((a,b)=>a.order-b.order);
  // 地図にある乗換駅はラベルを強調する。大きさが変わるので、印の位置を決める前に行う。
  const transferNames=transferStationNames(journey);
  if(transferNames.length===transferMarks.length){
   transferMarks.forEach((mark,i)=>{
    const names=transferNames[i].split('・').map(plainStationName);
    const existing=data.stations.find(s=>names.includes(plainStationName(s.name)));
    if(existing)[...stationLayer.querySelectorAll('.station-label')].find(b=>b.dataset.name===existing.name).classList.add('is-transfer');
    else mark.name=transferNames[i];
   });
  }
  const labelBoxes=stationLabelBoxes();
  for(const mark of transferMarks)Object.assign(mark,markClearOfLabels(mark,routePoints,labelBoxes));
  const markerPoints=[{...routePoints[0],kind:'origin'},...transferMarks];
  markerPoints.push({...routePoints.at(-1),kind:'destination'});
  for(const point of markerPoints){
   const marker=document.createElementNS('http://www.w3.org/2000/svg','g');
   marker.setAttribute('class',`route-marker route-marker-${point.kind}`);
   marker.setAttribute('transform',`translate(${point.x} ${point.y})`);
   for(const [className,radius] of [['route-marker-ring',12],['route-marker-core',5]]){
    const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('class',className);circle.setAttribute('r',radius);
    marker.appendChild(circle);
   }
   routeGroup.appendChild(marker);
  }
 }
 // 地図にない乗換駅は、印のそばに駅名のラベルを足す。
 for(const {x,y,name} of transferMarks){
  if(!name)continue;
  const label=document.createElement('div');
  label.className='station-label transfer-name is-transfer';
  label.textContent=name;
  Object.assign(label.style,{left:`${x/1352*100}%`,top:`${y/1080*100}%`});
  stationLayer.appendChild(label);
  placeTransferLabel(label);
 }
 mapRegion.classList.toggle('has-active-route',routePoints.length>1);
 document.getElementById('travel-route').textContent=routePoints.length?'路線図上の経路を強調表示中':'';
 document.getElementById('transfer-count').textContent=journey?.transfers??'—';

 select.value=selectedStationName;
}
function selectStation(name){selectedStationName=name;updateTravelDisplay();}
for(const s of data.stations){
 const button=document.createElement('button');button.type='button';button.className='station-label';
 button.dataset.name=s.name;button.dataset.registered=String(Boolean(data.times[s.name]));
 button.textContent=s.name;button.setAttribute('aria-label',`${s.name}${data.times[s.name]?'からの所要時間を表示':'（所要時間未登録）'}`);
 Object.assign(button.style,{left:`${s.x/1352*100}%`,top:`${s.y/1080*100}%`,width:`${s.width/1352*100}%`,height:`${s.height/1080*100}%`});
 button.dataset.stationId=s.name==='白山'?'hakusan':s.name==='本駒込'?'honkomagome':s.name;
 button.style.setProperty('--station-center-x',`${(s.x+s.width/2)/1352*100}%`);
 button.style.setProperty('--station-width',`${s.width/1352*100}%`);
 if(['白山','本駒込'].includes(s.name)){
  button.classList.add('destination');button.style.fontSize=`${s.name==='白山'?22/10.8:19/10.8}cqh`;
  button.dataset.destination=s.name==='白山'?'hakusan':'honkomagome';
  button.setAttribute('aria-label',`目的地を${s.name}に変更`);
  button.addEventListener('click',()=>setDestination(button.dataset.destination));
 }else button.addEventListener('click',()=>selectStation(s.name));
 stationLayer.appendChild(button);
}
const names=[...Object.keys(data.times),...data.stations.map(s=>s.name).filter(n=>!data.times[n]&&!['白山','本駒込'].includes(n))];
for(const name of names){const o=document.createElement('option');o.value=name;o.textContent=name+(data.times[name]?'':'（時間未登録）');select.appendChild(o);}
select.addEventListener('change',()=>selectStation(select.value));
function setDestination(id){
 selectedDestinationId=id;
 document.querySelectorAll('.destination-button').forEach(b=>{const active=b.dataset.destination===id;b.classList.toggle('is-selected',active);b.setAttribute('aria-pressed',String(active));});
 updateTravelDisplay();
}
document.querySelectorAll('.destination-button').forEach(b=>b.addEventListener('click',()=>setDestination(b.dataset.destination)));
updateTravelDisplay();
