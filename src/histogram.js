define(function (require) {

    var max = require('./statistics/max');
    var min = require('./statistics/min');
    var quantile = require('./statistics/quantile');
    var deviation = require('./statistics/deviation');
    var dataProcess = require('./util/dataProcess');
    var dataPreprocess = dataProcess.dataPreprocess;
    var normalizeDimensions = dataProcess.normalizeDimensions;
    var array = require('./util/array');
    var ascending = array.ascending;
    var map = array.map;
    var range = require('./util/range');
    var bisect = array.bisect;
    var tickStep = require('./util/tickStep');

    /**
     * Compute bins for histogram
     * @param  {Array.<number>} data
     * @param  {Object|string} optOrMethod Optional settings or `method`.
     * @param  {Object|string} optOrMethod.method 'squareRoot' | 'scott' | 'freedmanDiaconis' | 'sturges'
     * @param  {Array.<number>|number} optOrMethod.dimensions If data is a 2-d array,
     *         which dimension will be used to calculate histogram.
     * @return {Object}
     */
    function computeBins(data, optOrMethod) {
        var opt = typeof optOrMethod === 'string'
            ? { method: optOrMethod }
            : (optOrMethod || {});

        var threshold = opt.method == null
            ? thresholdMethod.squareRoot
            : thresholdMethod[opt.method];
        var dimensions = normalizeDimensions(opt.dimensions);

        var values = dataPreprocess(data, {
            dimensions: dimensions,
            toOneDimensionArray: true
        });
        var maxValue = max(values);
        var minValue = min(values);
        var binsNumber = threshold(values, minValue, maxValue);
        var tickStepResult = tickStep(minValue, maxValue, binsNumber);
        var step = tickStepResult.step;
        var toFixedPrecision = tickStepResult.toFixedPrecision;

        // return the xAxis coordinate for each bins, except the end point of the value
        var rangeArray = range(
            // use function toFixed() to avoid data like '0.700000001'
            +((Math.ceil(minValue / step) * step).toFixed(toFixedPrecision)),
            +((Math.floor(maxValue / step) * step).toFixed(toFixedPrecision)),
            step,
            toFixedPrecision
        );

        var len = rangeArray.length;

        var bins = new Array(len + 1);
        var leftBoundExtended = false;
        var rightBoundExtended = false;

        for (var i = 0; i <= len; i++) {
            bins[i] = {};
            bins[i].sample = [];
            if (i === 0) {
                if ((rangeArray[i] - minValue) === step) {
                    bins[i].x0 = minValue;
                } else {
                    bins[i].x0 = rangeArray[i] - step;
                    leftBoundExtended = true;
                }
            } else {
                bins[i].x0 = rangeArray[i - 1];
            }
            if (i === len) {
                if ((maxValue - rangeArray[i-1]) === step) {
                    bins[i].x1 = maxValue;
                } else {
                    bins[i].x1 = rangeArray[i - 1] + step;
                    rightBoundExtended = true;
                }
            } else {
                bins[i].x1 = rangeArray[i];
            }
        }

        for (var i = 0; i < values.length; i++) {
            if (minValue <= values[i] && values[i] <= maxValue) {
                bins[bisect(rangeArray, values[i], 0, len)].sample.push(values[i]);
            }
        }

        if (opt.padBounds) {
            var binLen = bins.length;
            if (binLen >= 2) {
                if (leftBoundExtended) {
                    bins[1].sample = bins[1].sample.concat(bins[0].sample);
                    bins[0].sample = [];
                }
                if (rightBoundExtended) {
                    bins[binLen - 2].sample = bins[binLen - 2].sample.concat(bins[binLen - 1].sample);
                    bins[binLen - 1].sample = [];
                }
            }
        }
        
        var data = map(bins, function (bin) {
            return [
                +((bin.x0 + bin.x1) / 2),
                bin.sample.length,
                bin.x0,
                bin.x1,
                bin.x0 + ' - ' + bin.x1
            ];
        });

        var customData = map(bins, function (bin) {
            return [bin.x0, bin.x1, bin.sample.length];
        });

        return {
            bins: bins,
            data: data,
            customData: customData
        };
    }

    /**
     * Four kinds of threshold methods used to
     * compute how much bins the histogram should be divided
     * @see  https://en.wikipedia.org/wiki/Histogram
     * @type {Object}
     */
    var thresholdMethod = {

        squareRoot: function (data) {

            var bins = Math.ceil(Math.sqrt(data.length));

            return bins > 50 ? 50 : bins;
        },

        scott: function (data, min, max) {

            return Math.ceil((max - min) / (3.5 * deviation(data) * Math.pow(data.length, -1 / 3)));
        },

        freedmanDiaconis: function (data, min, max) {

            data.sort(ascending);

            return Math.ceil(
                (max - min) / (2 * (quantile(data, 0.75) - quantile(data, 0.25)) * Math.pow(data.length, -1 / 3))
            );
        },

        sturges: function (data) {

            return Math.ceil(Math.log(data.length) / Math.LN2) + 1;

        }
    };

    return computeBins;

});