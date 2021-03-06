import {
    geoCentroid,
    geoInterpolate,
    geoOrthographic,
    geoPath
} from '../node_modules/d3-geo/dist/d3-geo.min';
import { transition } from '../node_modules/d3-transition/dist/d3-transition.min';
import { interpolate } from '../node_modules/d3-interpolate/dist/d3-interpolate.min';
import { select } from '../node_modules/d3-selection/dist/d3-selection.min';
import * as topojson from '../node_modules/topojson-client/dist/topojson-client.min';
import _merge from '../node_modules/lodash/merge';
import { debounce } from '../node_modules/debounce/index';

// From https://github.com/alexabruck/worldmap-sensitive
import WORLD_ATLAS from './world2-topo.json';
import REGION_COUNTRY_MAP from './regionCountryMap.json';

/**
 * All names of regions/countries internally are used in lowercase.
 */
export default class GlobeMap {
    constructor(document, customSettings) {
        /**
         * @type {Object}
         */
        this.document = document;

        /**
         * @type {DOM}
         */
        this.holder = document.querySelector(customSettings.holderSelector);

        /**
         * Will be merged with custom settings.
         *
         * @type {Object}
         */
        this.defaultSettings = {
            highlightedCountries: [],
            highlightedRegions: [],

            highlightColor: '#F90',

            land: {
                fillStyle: '#CCC',
                strokeStyle: '#000',
                strokeWidth: 0
            },

            borders: {
                strokeStyle: '#FFF',
                strokeWidth: 1
            },

            globe: {
                fillStyle: null,
                strokeStyle: '#CCC',
                strokeWidth: 1.5
            }
        };

        this.settings = _merge(this.defaultSettings, customSettings);

        /**
         * @type {Boolean}
         */
        this.initialized = false;

        /**
         * @type {Object}
         */
        this.layers = {
            canvas: null
        };

        /**
         * D3 Projection function.
         *
         * @type {Function}
         */
        this.projection = undefined;

        /**
         * D3 Geo path drawing function
         *
         * @type {Function}
         */
        this.geoPath = undefined;

        /**
         * Geojson of the entire world.
         *
         * @type {Object}
         */
        // this.landGeoJson = topojson.feature(WORLD_ATLAS, WORLD_ATLAS.objects.land);
        this.landGeoJson = topojson.feature(WORLD_ATLAS, WORLD_ATLAS.objects['world.geo']);

        /**
         * Geo json of the country borders.
         *
         * @type {Object}
         */
        // this.bordersGeoJson = topojson.mesh(WORLD_ATLAS, WORLD_ATLAS.objects.countries, (a, b) => a !== b);
        this.bordersGeoJson = topojson.mesh(WORLD_ATLAS);

        /**
         * Geojson of individual countries.
         *
         * @type {Object}
         */
        // this.countriesGeoJson = topojson.feature(WORLD_ATLAS, WORLD_ATLAS.objects.countries).features;
        this.countriesGeoJson = topojson.feature(WORLD_ATLAS, WORLD_ATLAS.objects['world.geo']).features;

        /**
         * @type {Object}
         */
        this.canvasContext = undefined;

        /**
         * @type {Object}
         */
        this.holderBoundingBox = this.holder.getBoundingClientRect();

        /**
         * List of highlighted countries.
         *
         * @type {Array.<String>}
         */
        this.highlightedCountries = [];

        /**
         * @type {Number}
         */
        this.zoom = 1;

        // Loop through the selected highlighted countries
        // and activate the highlight.
        for (let i = 0; i < this.settings.highlightedCountries.length; i++) {
            this.highlightCountry(
                this.settings.highlightedCountries[i].name,
                this.settings.highlightedCountries[i].color
            );
        }

        // Loop through the selected highlighted continents
        // and activate the highlight.
        for (let i = 0; i < this.settings.highlightedRegions.length; i++) {
            this.highlightRegion(
                this.settings.highlightedRegions[i].name,
                this.settings.highlightedRegions[i].color
            );
        }

        /**
         * Mapping between custom regions
         * and their zoom function.
         *
         * @type {Object.<Function>}
         */
        this.regionToZoomFunction = {
            'africa': this.zoomOnAfrica.bind(this),
            'antarctica': this.zoomOnAntarctica.bind(this),
            'asia': this.zoomOnAsia.bind(this),
            'australia and new zealand': this.zoomOnAustraliaAndNewZealand.bind(this),
            'europe': this.zoomOnEurope.bind(this),
            'middle east': this.zoomOnMiddleEast.bind(this),
            'northern africa': this.zoomOnNorthernAfrica.bind(this),
            'caribbean': this.zoomOnCaribbean.bind(this),
            'central asia': this.zoomOnCentralAsia.bind(this),
            'central america': this.zoomOnCentralAmerica.bind(this),
            'eastern asia': this.zoomOnEasternAsia.bind(this),
            'eastern europe': this.zoomOnEasternEurope.bind(this),
            'north america': this.zoomOnNorthAmerica.bind(this),
            'northern europe': this.zoomOnNorthernEurope.bind(this),
            'southern africa': this.zoomOnSouthernAfrica.bind(this),
            'southern asia': this.zoomOnSouthernAsia.bind(this),
            'south america': this.zoomOnSouthAmerica.bind(this),
            'southern europe': this.zoomOnSouthernEurope.bind(this),
            'southeastern asia': this.zoomOnSouthEasternAsia.bind(this),
            'western africa': this.zoomOnWesternAfrica.bind(this),
            'western europe': this.zoomOnWesternEurope.bind(this),
        };

        /**
         * @type {Boolean}
         */
        this.initialized = false;
    }

    /**
     * Initialize the class.
     */
    init() {
        this.setupLayers();
        this.setupProjection();
        this.render();

        // Add a debounced resize listener.
        window.addEventListener('resize', debounce(this.resize.bind(this), 200));

        this.initialized = true;
    }

    /**
     * Draw all the map layers.
     */
    render() {
        const context = this.canvasContext;
        const width = this.holderBoundingBox.width;
        const height = this.holderBoundingBox.height;
        const path = this.geoPath;

        context.clearRect(0, 0, width, height);

        // First draw the basic sphere of the world.
        context.beginPath();
        path({ type: 'Sphere' });
        context.fillStyle = this.settings.globe.fillStyle;
        context.strokeStyle = this.settings.globe.strokeStyle;
        context.lineWidth = this.settings.globe.strokeWidth;
        context.stroke();

        if (this.settings.globe.fillStyle !== null) {
            context.fill();
        }

        // Draw the outline of the continents.
        context.beginPath();
        path(this.landGeoJson);
        context.fillStyle = this.settings.land.fillStyle;
        context.strokeStyle = this.settings.land.strokeStyle;
        context.lineWidth = this.settings.land.strokeWidth;
        context.fill();

        if (this.settings.land.strokeWidth > 0) {
            context.stroke();
        }

        // Draw the highlighted countries.
        for (let i = 0; i < this.highlightedCountries.length; i++) {
            const country = this.highlightedCountries[i];
            context.beginPath();
            path(country.geojson);
            context.fillStyle = country.color;
            context.fill();
        }

        // Draw the country borders over everything.
        context.beginPath();
        path(this.bordersGeoJson);
        context.strokeStyle = this.settings.borders.strokeStyle;
        context.lineWidth = this.settings.borders.strokeWidth;
        context.stroke();
    }

    /**
     * Setup all required layers.
     */
    setupLayers() {
        this.layers.canvas = select(this.holder).append('canvas')
            .attr('width', this.holderBoundingBox.width)
            .attr('height', this.holderBoundingBox.height);

        this.canvasContext = this.layers.canvas.node().getContext('2d');
    }

    /**
     * Depends on setupLayers().
     */
    setupProjection() {
        // We have to offset the coordinates by the zoom level to keep the map centered on the selected coordinate.
        const left = this.holderBoundingBox.width - (this.holderBoundingBox.width * this.zoom);
        const top = this.holderBoundingBox.height - (this.holderBoundingBox.height * this.zoom);

        // First create the projection.
        this.projection = geoOrthographic().fitExtent([[left, top], [this.holderBoundingBox.width * this.zoom, this.holderBoundingBox.height * this.zoom]], {
            type: 'Sphere'
        });

        // Now we can create a geo path function.
        this.geoPath = geoPath(this.projection, this.canvasContext);

        const baseProjection = geoOrthographic().fitExtent([[0, 0], [this.holderBoundingBox.width, this.holderBoundingBox.height]], {
            type: 'Sphere'
        });

        this.baseProjectionScale = baseProjection.scale();
    }

    /**
     * Highlight a particular region or country.
     *
     * @param  {String} name
     * @param  {String} color
     */
    highlight(name, color) {
        if (REGION_COUNTRY_MAP[name]) {
            this.highlightRegion(name, color);
        } else {
            this.highlightCountry(name, color);
        }
    }

    /**
     * Unhighlight country or region.
     *
     * @param {String} name
     */
    unhighlight(name) {
        if (REGION_COUNTRY_MAP[name]) {
            this.unhighlightRegion(name);
        } else {
            this.unhighlightCountry(name);
        }
    }

    /**
     * Highlight a specific country.
     *
     * @param  {String}           countryName
     * @param  {String|undefined} color       optional
     */
    highlightCountry(countryName, color, render = true) {
        const countryGeoJson = this.getCountryGeoJson(countryName);

        if (countryGeoJson !== null) {
            if (this.isCountryHighlighted(countryName) === false) {
                this.highlightedCountries.push({
                    id: countryGeoJson.properties.id,
                    name: countryName.toLowerCase(),
                    color: color || this.settings.highlightColor,
                    geojson: countryGeoJson
                });

                if (render === true) {
                    this.render();
                }
            }
        } else {
            console.log('No iso code was found for ' + countryName + ' so cannot highlight it.');
        }
    }

    unhighlightCountry(name, render = true) {
        for (let i = 0; i < this.highlightedCountries.length; i++) {
            const highlightedCountry = this.highlightedCountries[i];

            if (highlightedCountry.name === name.toLowerCase()) {

                this.highlightedCountries.splice(i, 1);

                if (render === true) {
                    this.render();
                }

                break;
            }
        }
    }

    isCountryHighlighted(countryName) {
        const countryGeoJson = this.getCountryGeoJson(countryName);

        if (countryGeoJson !== undefined) {
            const result = this.highlightedCountries.find(obj => obj.id === countryGeoJson.properties.id);

            if (result === undefined) {
                return false;
            }
        }

        return true;
    }

    /**
     * Highlight a specific region.
     *
     * @param {String}           regionName
     * @param {String|undefined} color       optional
     */
    highlightRegion(regionName, color) {
        const countries = REGION_COUNTRY_MAP[regionName];

        if (countries !== undefined) {
            for (let i = 0; i < countries.length; i++) {
                const country = countries[i];

                this.highlightCountry(country, color, false);
            }

            this.render();
        } else {
            console.log(`The region of ${regionName} was not found in the continent list`);
        }
    }

    /**
     * Unhighlight a specific region.
     *
     * @param {} regionName
     */
    unhighlightRegion(regionName) {
        const countries = REGION_COUNTRY_MAP[regionName];

        if (countries !== undefined) {
            for (let i = 0; i < countries.length; i++) {
                const country = countries[i];

                this.unhighlightCountry(country, false);
            }

            this.render();
        } else {
            console.log(`The region of ${regionName} was not found in the continent list`);
        }
    }

    /**
     * Center on a specific country.
     *
     * @param {String} name Name of country.
     */
    centerOnCountry(name) {
        this.zoomOn(name, this.zoom);
    }

    /**
     * Zoom on a specific country or region.
     *
     * @param  {String} name
     * @param  {Number} zoom
     * @param  {Number} offsetX
     * @param  {Number} offsetY
     */
    zoomOn(name, zoom, offsetX, offsetY) {
        name = name.toLowerCase();

        if (this.regionToZoomFunction[name]) {
            this.regionToZoomFunction[name](zoom, offsetX, offsetY);
        } else {
            this.zoomOnCountry(name, zoom, offsetX, offsetY);
        }
    }

    /**
     * Zoom on a specific country.
     *
     * @param {string}        countryName
     * @param {String|Number} zoom
     * @param {Number}        offsetX     in geo coordinates, not in pixels.
     * @param {Number}        offsetY     in geo rotation coordinates, not in pixels.
     */
    zoomOnCountry(countryName, zoom = 'auto', offsetX = 0, offsetY = 0) {
        const vm = this;

        const countryGeoJson = this.getCountryGeoJson(countryName);

        if (countryGeoJson !== undefined) {
            this.zoomedCountry = countryName;

            if (zoom === 'auto') {
                zoom = this.calculateZoomLevelForFullscreenCountry(countryName, countryGeoJson);
            }

            // Do the transition.
            transition().duration(1250).tween('centerOnCountry', () => {
                const [x, y] = geoCentroid(countryGeoJson);

                // Create interpolation function.
                const interpolateRotation = geoInterpolate(vm.projection.rotate(), [-x - offsetX, -y - offsetY]);

                let interpolationScale;

                // If the zoom differs we will also animate that.
                if (typeof zoom === 'number') {
                    const newScale = this.baseProjectionScale * zoom;
                    this.zoom = zoom;

                    interpolationScale = interpolate(vm.projection.scale(), newScale);
                }

                return t => {
                    vm.projection.rotate(interpolateRotation(t));

                    if (interpolationScale) {
                        vm.projection.scale(interpolationScale(t));
                    }

                    vm.render();
                };
            });
        } else {
            console.log(`No iso code was found for ${countryName} so cannot zoom on it.`);
        }
    }

    resize() {
        // Update the bounding box.
        this.holderBoundingBox = this.holder.getBoundingClientRect();

        // Adjust the size of the canvas.
        this.layers.canvas.node().width = this.holderBoundingBox.width;
        this.layers.canvas.node().height = this.holderBoundingBox.height;

        // Recreate the projecction.
        this.setupProjection();

        // If we are zoomed in on a country we will have to adjust
        // the new projection to center back on the country.
        if (typeof this.zoomedCountry === 'string') {
            const countryGeoJson = this.getCountryGeoJson(this.zoomedCountry);
            const [x, y] = geoCentroid(countryGeoJson);
            this.projection.rotate([-x, -y]).scale(this.baseProjectionScale * this.zoom);
        }

        this.render();
    }

    /**
     * Calculates the correct zoom level for a country to be
     * completely visible in the canvas.
     *
     * @param  {String} countryName
     * @param  {Object} countryGeoJson
     * @return {Number}
     */
    calculateZoomLevelForFullscreenCountry(countryName, countryGeoJson) {
        let zoomlevel;

        // For some reason the calculation for the correct zoom level
        // is way too zoomed in for some countries, so I have defined
        // here a list of correct zoom levels for those specific
        // countries.
        const predefinedFillZoomLevels = {
            australia: 2.5,
            germany: 14,
            ireland: 20,
            mexico: 3.8,
            sweden: 8,
            'united states': 2
        };

        if (predefinedFillZoomLevels[countryName]) {
            zoomlevel = predefinedFillZoomLevels[countryName];
        } else {
            const tempProjection = geoOrthographic().fitExtent([[0, 0], [this.holderBoundingBox.width, this.holderBoundingBox.height]], countryGeoJson);

            // Correction factor because the tempProjection is always
            // a bit zoomed in too much on the selected country.
            const correctionFactor = 0.65;

            zoomlevel = (tempProjection.scale() / this.baseProjectionScale) * correctionFactor;
        }

        if (zoomlevel < 1) {
            return 1;
        }

        return zoomlevel;
    }

    /**
     * @param {Number} zoom
     */
    setZoom(zoom = null) {
        const vm = this;

        if (typeof zoom === 'number' && zoom !== this.zoom) {
            const newScale = this.baseProjectionScale * zoom;
            this.zoom = zoom;

            const interpolationScale = interpolate(vm.projection.scale(), newScale);

            transition().duration(1250).tween('zoom', () => {
                return t => {
                    vm.projection.scale(interpolationScale(t));
                    vm.render();
                };
            });
        }
    }

    /**
     * @param  {String} countryName
     * @return {Object}
     */
    getCountryGeoJson(countryName) {
        countryName = countryName.toLowerCase();

        const countryGeoJson = this.countriesGeoJson.find(country => {
            return country.properties.name.toLowerCase() === countryName;
        });

        return countryGeoJson;
    }

    /**
     * Zooming api.
     */
    resetZoom() {
        this.setZoom(1);
    }

    zoomOnAfrica(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('central african republic', zoomlevel || 1.5, 0 + offsetX, -2 + offsetY);
    }

    zoomOnAntarctica(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('antarctica', zoomlevel || 2.1, offsetX, offsetY);
    }

    zoomOnAsia(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('india', zoomlevel || 1.2, offsetX, offsetY);
    }

    zoomOnAustraliaAndNewZealand(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('australia', zoomlevel || 1.8, 10 + offsetX, offsetY);
    }

    zoomOnEurope(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('germany', zoomlevel || 2.8, offsetX, offsetY);
    }

    zoomOnMiddleEast(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('iraq', zoomlevel || 2.4, offsetX, offsetY);
    }

    zoomOnNorthernAfrica(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('niger', zoomlevel || 2.4, offsetX, offsetY);
    }

    zoomOnCaribbean(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('cuba', zoomlevel || 3.5, offsetX, offsetY);
    }

    zoomOnCentralAsia(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('uzbekistan', zoomlevel || 3.5, offsetX, offsetY);
    }

    zoomOnCentralAmerica(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('honduras', zoomlevel || 3.5, offsetX, offsetY);
    }

    zoomOnEasternAsia(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('china', zoomlevel || 2, offsetX, offsetY);
    }

    zoomOnEasternEurope(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('romania', zoomlevel || 5.4, offsetX, offsetY);
    }

    zoomOnNorthAmerica(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('united states', zoomlevel || 1.4, offsetX, offsetY);
    }

    zoomOnNorthernEurope(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('sweden', zoomlevel || 4.4, offsetX, offsetY);
    }

    zoomOnSouthernAfrica(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('botswana', zoomlevel || 2.4, offsetX, offsetY);
    }

    zoomOnSouthernAsia(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('pakistan', zoomlevel || 2.4, offsetX, offsetY);
    }

    zoomOnSouthAmerica(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('bolivia', zoomlevel || 1.6, 0 + offsetX, -3.5 + offsetY);
    }

    zoomOnSouthernEurope(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('italy', zoomlevel || 4.4, -8 + offsetX, offsetY);
    }

    zoomOnSouthEasternAsia(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('indonesia', zoomlevel || 2, -2 + offsetX, offsetY);
    }

    zoomOnWesternAfrica(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('burkina faso', zoomlevel || 2.4, 5 + offsetX, offsetY);
    }

    zoomOnWesternEurope(zoomlevel, offsetX = 0, offsetY = 0) {
        this.zoomOnCountry('belgium', zoomlevel || 4.4, offsetX, offsetY);
    }
}
