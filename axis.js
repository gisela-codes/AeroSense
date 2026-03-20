var serviceId        = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
var characteristicId = "beb5483e-36e1-4688-b7f5-ea07361b26a8";

var myCharacteristic = null;
var dec = new TextDecoder();
var enc = new TextEncoder();

var svgWidth = 1200;
var svgHeight = 600;

var svg, g, x, y, xAxis, yAxis, path, line, paths;

let data = [];
const maxPoints = 300;

let startTime = null;

document.addEventListener("DOMContentLoaded", function() {
  svg = d3.select("#chart")
    .append("svg")
    .attr("width", svgWidth)
    .attr("height", svgHeight);

  svg.append("text")
    .attr("x", svgWidth / 2)
    .attr("y", 24)
    .attr("text-anchor", "middle")
    .attr("class", "chart-title")
    .text("6-Axis IMU Data");

  var margin = { top: 60, right: 50, bottom: 50, left: 70 },
  width = svgWidth - margin.left - margin.right,
  height = svgHeight - margin.top - margin.bottom;

  g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // Scales
  x = d3.scaleLinear()
    .range([0, width]);

  y = d3.scaleLinear()
    .range([height, 0]);

  // Axes
  xAxis = d3.axisBottom(x)
    .tickFormat(d => {
      const totalSeconds = Math.floor(d);         
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${minutes}:${seconds.toString().padStart(2, "0")}`;
    });
  yAxis = d3.axisLeft(y);

  // Axis groups
  g.append("g")
    .attr("class", "x axis")
    .attr("transform", `translate(0,${height})`);

  g.append("g")
    .attr("class", "y axis");

  // Path element 
  path = g.append("path")
    .attr("class", "line");

  // Create line generators for each axis
  const lines = {
    ax: d3.line().x(d => x(d.t)).y(d => y(d.ax)),
    ay: d3.line().x(d => x(d.t)).y(d => y(d.ay)),
    az: d3.line().x(d => x(d.t)).y(d => y(d.az)),
    gx: d3.line().x(d => x(d.t)).y(d => y(d.gx)),
    gy: d3.line().x(d => x(d.t)).y(d => y(d.gy)),
    gz: d3.line().x(d => x(d.t)).y(d => y(d.gz))
  };

  // Create paths for each axis with different colors
  const colors = { ax: "#1f77b4", ay: "#ff7f0e", az: "#2ca02c", gx: "#d62728", gy: "#9467bd", gz: "#8c564b" };
  paths = {};
  Object.keys(lines).forEach(key => {
    paths[key] = g.append("path")
      .attr("class", "line")
      .attr("stroke", colors[key])
      .attr("stroke-width", 2)
      .attr("fill", "none");
  });

  line = lines;

  // Initialize domains with default ranges
  x.domain([0, 10]);
  y.domain([-20, 20]);

  // Draw initial axes
  g.select(".x.axis").call(xAxis);
  g.select(".y.axis").call(yAxis);

  // Create legend
  const legendDiv = document.querySelector("#legend");
  const labels = { ax: "Accel X", ay: "Accel Y", az: "Accel Z", gx: "Gyro X", gy: "Gyro Y", gz: "Gyro Z" };
  Object.keys(colors).forEach(key => {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-color" style="background-color: ${colors[key]}"></span>${labels[key]}`;
    legendDiv.appendChild(item);
  });

  // Add CSV export button handler
  if (document.querySelector("#downloadCSV")) {
    document.querySelector("#downloadCSV").onclick = downloadCSV;
  }

  // Add clear data button handler
  if (document.querySelector("#clearData")) {
    document.querySelector("#clearData").onclick = function() {
      data = [];
      startTime = null;
      updateChart();
      console.log("Data cleared");
    };
  }

  // Connect button handler
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
      document.querySelector("#connect").disabled = true;
      document.querySelector("#connect").textContent = "Connected";
    })
    .catch(error => {
      console.error("Connection failed:", error);
    });
  };
});

function updateChart() {
  if (data.length === 0) return;

  const visibleData = data.length > maxPoints
    ? data.slice(data.length - maxPoints)
    : data;

  const tMin = d3.min(visibleData, d => d.t);
  const tMax = d3.max(visibleData, d => d.t);

  // THIS makes it "slide"
  x.domain([tMin, tMax]);

  const minY = d3.min(visibleData, d => Math.min(d.ax,d.ay,d.az,d.gx,d.gy,d.gz));
  const maxY = d3.max(visibleData, d => Math.max(d.ax,d.ay,d.az,d.gx,d.gy,d.gz));
  const pad = (maxY - minY) * 0.1 || 1;
  y.domain([minY - pad, maxY + pad]);

  g.select(".x.axis").call(xAxis);
  g.select(".y.axis").call(yAxis);

  Object.keys(line).forEach(key => {
    paths[key].datum(visibleData).attr("d", line[key]);
  });
}

let startTms = null;

function handleNotification(event) {
  const value = event.target.value;
  const view = (value instanceof DataView)
    ? value
    : new DataView(value.buffer, value.byteOffset, value.byteLength);

  if (view.byteLength < 28) return;

  const t_ms = view.getUint32(0, true);
  const ax = view.getFloat32(4, true);
  const ay = view.getFloat32(8, true);
  const az = view.getFloat32(12, true);
  const gx = view.getFloat32(16, true);
  const gy = view.getFloat32(20, true);
  const gz = view.getFloat32(24, true);

  if (startTms === null) startTms = t_ms;
  const elapsedSeconds = (t_ms - startTms) / 1000;

  data.push({ t: elapsedSeconds, t_ms, ax, ay, az, gx, gy, gz });

  updateChart();
}


function downloadCSV() {
  if (data.length === 0) {
    alert("No data to export");
    return;
  }

  // Create CSV header
  let csv = "Time(s),Time(ms),AccelX,AccelY,AccelZ,GyroX,GyroY,GyroZ\n";

  // Add data rows
  data.forEach(row => {
    csv += `${row.t.toFixed(3)},${row.t_ms},${row.ax.toFixed(6)},${row.ay.toFixed(6)},${row.az.toFixed(6)},${row.gx.toFixed(6)},${row.gy.toFixed(6)},${row.gz.toFixed(6)}\n`;
  });

  // Create blob and download
  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `imu_data_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);

  console.log(`Exported ${data.length} data points to CSV`);
}
