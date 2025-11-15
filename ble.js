var serviceId        = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
var characteristicId = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

var myCharacteristic = null;
var dec = new TextDecoder();
var enc = new TextEncoder();

var svgWidth = 1200;
var svgHeight = 600;


var svg = d3.select("#chart")
  .append("svg")
  .attr("width", svgWidth)
  .attr("height", svgHeight);

svg.append("text")
  .attr("x", svgWidth / 2)
  .attr("y", 24)
  .attr("text-anchor", "middle")
  .attr("class", "chart-title")
  .text("Oxygen Concentration");

var margin = { top: 60, right: 50, bottom: 50, left: 70 },
width = svgWidth - margin.left - margin.right,
height = svgHeight - margin.top - margin.bottom;

var g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

let data = [];
const maxPoints = 300; 
// Scales
var x = d3.scaleLinear()
  .range([0, width]);

var y = d3.scaleLinear()
  .range([height, 0]);

// Axes
var xAxis = d3.axisBottom(x)
  .tickFormat(d => {
    const totalSeconds = Math.floor(d);         
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  });
var yAxis = d3.axisLeft(y);

// Axis groups
g.append("g")
  .attr("class", "x axis")
  .attr("transform", `translate(0,${height})`);

g.append("g")
  .attr("class", "y axis");

// Path element 
var path = g.append("path")
  .attr("class", "line");

var line = d3.line()
  .x(d => x(d.t))
  .y(d => y(d.o2));

function updateChart() {
  if (data.length === 0) return;

  x.domain([0, d3.max(data, d => d.t)]);

  const minO2 = d3.min(data, d => d.o2);
  const maxO2 = d3.max(data, d => d.o2);
  y.domain([minO2 - 2, maxO2 + 2]);

  g.select(".x.axis").call(xAxis);
  g.select(".y.axis").call(yAxis);

  path.datum(data).attr("d", line);
}



document.querySelector("#connect").onclick = function () {
  navigator.bluetooth.requestDevice({
    filters: [{ services: [serviceId] }]
  })
  .then(device => {
    return device.gatt.connect();
  })
  .then(server => {
    return server.getPrimaryService(serviceId);
  })
  .then(service => {
    return service.getCharacteristic(characteristicId);
  })
  .then(characteristic => {
    myCharacteristic = characteristic;
    console.log("Got characteristic:", myCharacteristic);

    return myCharacteristic.startNotifications();
  })
  .then(() => {
    console.log("Notifications started");
    myCharacteristic.addEventListener("characteristicvaluechanged", handleNotification);
  })
  .catch(error => {
    console.error("Connection failed:", error);
  });
};

let startTime = null;

function handleNotification(event) {
  const value = event.target.value;

  const text = dec.decode(value);
  const o2 = parseFloat(text);

  if (startTime === null) {
    startTime = Date.now();
  }

  const elapsedSeconds = (Date.now() - startTime) / 1000;

  data.push({
    t: elapsedSeconds, // time since start in seconds
    o2: o2
  });

  if (data.length > maxPoints) {
    data.shift();
  }

  updateChart();
}
