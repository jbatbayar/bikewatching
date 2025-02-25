// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiamVzc2ljYWJhdGJheWFyIiwiYSI6ImNtN2VpYmptazBnZXUybHB2cTN1ZW13eHIifQ.2jci8sqvckxFcL-Ls31qhQ';

const map = new mapboxgl.Map({
    container: 'map', 
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027], 
    zoom: 12,
    minZoom: 5,
    maxZoom: 18
});

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id
    );

    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id
    );

    return stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
    });
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime(trips, timeFilter) {
    return timeFilter === -1
        ? trips
        : trips.filter((trip) => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);
            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
        });
}

map.on('load', async () => { 
    const styling = {
        'line-color': '#32D400',
        'line-width': 5,
        'line-opacity': 0.6
    };

    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });

    map.addLayer({
        id: 'bike-lanes-boston',
        type: 'line',
        source: 'boston_route',
        paint: styling
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    map.addLayer({
        id: 'bike-lanes-cambridge',
        type: 'line',
        source: 'cambridge_route',
        paint: styling
    });

    const jsonurl = "https://dsc106.com/labs/lab07/data/bluebikes-stations.json";

    try {
        let jsonData = await d3.json(jsonurl);
        console.log('Loaded JSON Data:', jsonData);

        let stations = jsonData.data.stations;
        console.log('Stations Array:', stations);

        let svg = d3.select('#map').select('svg');

        function getCoords(station) {
            const point = new mapboxgl.LngLat(+station.lon, +station.lat);
            const { x, y } = map.project(point);
            return { cx: x, cy: y };
        }

        let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

        let circles = svg
            .selectAll('circle')
            .data(stations, (d) => d.short_name)
            .enter()
            .append('circle')
            .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)) ;

        function updatePositions() {
            circles
                .attr('cx', d => getCoords(d).cx)
                .attr('cy', d => getCoords(d).cy);
        }

        updatePositions();

        map.on('move', updatePositions);
        map.on('zoom', updatePositions);
        map.on('resize', updatePositions);
        map.on('moveend', updatePositions);

        let trips = await d3.csv(
            'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
            (trip) => {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
                return trip;
            }
        );

        stations = computeStationTraffic(stations, trips);
        console.log(stations);

        const radiusScale = d3
            .scaleSqrt()
            .domain([0, d3.max(stations, (d) => d.totalTraffic)])
            .range([0, 25]);

        circles
            .each(function (d) {
            d3.select(this)
                .append('title')
                .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        });

        circles.attr('r', d => radiusScale(d.totalTraffic));

        const timeSlider = document.getElementById('time-slider');
        const selectedTime = document.getElementById('selected-time');
        const anyTimeLabel = document.getElementById('any-time');

        function updateTimeDisplay() {
            let timeFilter = Number(timeSlider.value);

            if (timeFilter === -1) {
                selectedTime.textContent = '';
                anyTimeLabel.style.display = 'block';
            } else {
                selectedTime.textContent = formatTime(timeFilter);
                anyTimeLabel.style.display = 'none';
            }

            updateScatterPlot(timeFilter);
        }

        function updateScatterPlot(timeFilter) {
            const filteredTrips = filterTripsbyTime(trips, timeFilter);
            const filteredStations = computeStationTraffic(stations, filteredTrips);
            timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

            circles
                .data(filteredStations, (d) => d.short_name)
                .join('circle')
                .attr('r', (d) => radiusScale(d.totalTraffic))
                .style('--departure-ratio', (d) =>
                    stationFlow(d.departures / d.totalTraffic),
                  );
        }

        timeSlider.addEventListener('input', updateTimeDisplay);
        updateTimeDisplay();

    } catch (error) {
        console.error('Error loading JSON:', error);
    }
});
