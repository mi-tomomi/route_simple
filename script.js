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

// Figmaの路線を接続グラフに変換し、全駅の強調経路を自動生成する。
function createRouteGraph(){
 const sampleDistance=9,transferDistance=20;
 const throughServices=new Set(['中央線|総武線','半蔵門線|田園都市線','副都心線|東横線','副都心線|東武東上線']);
 const nodes=[],adjacency=[],lineNodes=new Map(),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 for(const [line,route] of Object.entries(data.routes)){
  const selected=[];let last=null;
  route.points.forEach(([x,y],index)=>{
   if(!last||Math.hypot(x-last.x,y-last.y)>=sampleDistance||index===route.points.length-1){
    const id=nodes.length;nodes.push({id,x,y,line});adjacency.push([]);selected.push(id);last={x,y};
   }
  });
  for(let i=1;i<selected.length;i++){
   const a=selected[i-1],b=selected[i],weight=distance(nodes[a],nodes[b]);
   adjacency[a].push({to:b,weight,transfer:0});adjacency[b].push({to:a,weight,transfer:0});
  }
  if(route.closed&&selected.length>2){
   const a=selected[0],b=selected[selected.length-1],weight=distance(nodes[a],nodes[b]);
   adjacency[a].push({to:b,weight,transfer:0});adjacency[b].push({to:a,weight,transfer:0});
  }
  lineNodes.set(line,selected);
 }
 const cellSize=transferDistance,buckets=new Map(),bucketKey=(x,y)=>`${Math.floor(x/cellSize)},${Math.floor(y/cellSize)}`;
 nodes.forEach(node=>{const key=bucketKey(node.x,node.y);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(node.id);});
 nodes.forEach(node=>{
  const cx=Math.floor(node.x/cellSize),cy=Math.floor(node.y/cellSize);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const otherId of buckets.get(`${cx+dx},${cy+dy}`)??[]){
   if(otherId<=node.id||nodes[otherId].line===node.line)continue;
   const gap=distance(node,nodes[otherId]);
   if(gap>transferDistance)continue;
   const pair=[node.line,nodes[otherId].line].sort().join('|');
   const transfer=throughServices.has(pair)?0:1,weight=(transfer?35:3)+gap;
   adjacency[node.id].push({to:otherId,weight,transfer});adjacency[otherId].push({to:node.id,weight,transfer});
  }
 });
 function stationCandidates(name){
  const point=position(name);if(!point)return [];
  const nearest=[];
  for(const [line,ids] of lineNodes){
   let bestId=ids[0],bestDistance=Infinity;
   for(const id of ids){const d=Math.hypot(point[0]-nodes[id].x,point[1]-nodes[id].y);if(d<bestDistance){bestDistance=d;bestId=id;}}
   nearest.push({id:bestId,line,distance:bestDistance});
  }
  nearest.sort((a,b)=>a.distance-b.distance);
  const limit=Math.max(50,nearest[0].distance+30);
  return nearest.filter(item=>item.distance<=limit).slice(0,6);
 }
 class Heap{
  constructor(){this.items=[];}
  push(item){this.items.push(item);let i=this.items.length-1;while(i){const p=(i-1)>>1;if(this.items[p][0]<=item[0])break;this.items[i]=this.items[p];i=p;}this.items[i]=item;}
  pop(){if(!this.items.length)return null;const root=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(true){let c=i*2+1;if(c>=this.items.length)break;if(c+1<this.items.length&&this.items[c+1][0]<this.items[c][0])c++;if(this.items[c][0]>=last[0])break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}return root;}
 }
 const cache=new Map();
 return function findRoute(from,to,targetTransfers){
  const cacheKey=`${from}|${to}|${targetTransfers}`;if(cache.has(cacheKey))return cache.get(cacheKey);
  const starts=stationCandidates(from),ends=stationCandidates(to),endSet=new Set(ends.map(item=>item.id));
  const best=new Map(),previous=new Map(),heap=new Heap();
  starts.forEach(start=>{const key=`${start.id}|0`;best.set(key,start.distance);heap.push([start.distance,start.id,0]);});
  let finalKey=null;
  while(heap.items.length){
   const [cost,id,transfers]=heap.pop(),key=`${id}|${transfers}`;
   if(cost!==best.get(key))continue;
   if(endSet.has(id)&&transfers===targetTransfers){finalKey=key;break;}
   for(const edge of adjacency[id]){
    const nextTransfers=transfers+edge.transfer;if(nextTransfers>Math.max(targetTransfers,3))continue;
    const nextKey=`${edge.to}|${nextTransfers}`,nextCost=cost+edge.weight;
    if(nextCost<(best.get(nextKey)??Infinity)){best.set(nextKey,nextCost);previous.set(nextKey,{key,transfer:edge.transfer});heap.push([nextCost,edge.to,nextTransfers]);}
   }
  }
  if(!finalKey){cache.set(cacheKey,[]);return [];}
  const path=[];for(let key=finalKey;key;){const link=previous.get(key);path.push({...nodes[Number(key.split('|')[0])],transferFromPrevious:link?.transfer??0});key=link?.key;}
  path.reverse();cache.set(cacheKey,path);return path;
 };
}
const findRoutePath=createRouteGraph();
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
 routeGroup.replaceChildren();
 const routePoints=journey?findRoutePath(selectedStationName,destinationNames[selectedDestinationId],journey.transfers):[];
 if(routePoints.length>1){
  const pathData=routePoints.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ');
  for(const className of ['route-path-halo','route-path','route-path-sparkle']){
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');
   path.setAttribute('class',className);path.setAttribute('data-route','automatic');path.setAttribute('d',pathData);
   path.setAttribute('pathLength','100');
   routeGroup.appendChild(path);
  }
  const markerPoints=[{...routePoints[0],kind:'origin'}];
  for(let i=1;i<routePoints.length;i++){
   if(routePoints[i].transferFromPrevious){
    markerPoints.push({x:(routePoints[i-1].x+routePoints[i].x)/2,y:(routePoints[i-1].y+routePoints[i].y)/2,kind:'transfer'});
   }
  }
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
 mapRegion.classList.toggle('has-active-route',routePoints.length>1);
 document.getElementById('travel-route').textContent=routePoints.length?'路線図上の経路を強調表示中':'';
 document.getElementById('transfer-count').textContent=journey?.transfers??'—';

 select.value=selectedStationName;
 document.querySelectorAll('.station-label').forEach(b=>{
  const active=b.dataset.destination?b.dataset.destination===selectedDestinationId:b.dataset.name===selectedStationName;
  b.classList.toggle('is-selected',active);b.setAttribute('aria-pressed',String(active));
 });
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
