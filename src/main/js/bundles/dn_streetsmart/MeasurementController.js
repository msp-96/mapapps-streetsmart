/*
 * Copyright (C) 2025 con terra GmbH (info@conterra.de)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import SpatialReference from "@arcgis/core/geometry/SpatialReference";

export default class MeasurementController {

    #highlights = null;

    activate() {
        this.#highlights = [];
    }

    deactivate() {
        this._clearMeasurementHighlights();
    }

    removeMeasurements() {
        this._clearMeasurementHighlights();
    }

    drawMeasurement(event) {
        const i18n = this._i18n.get().ui.measurement;
        const symbols = this._streetSmartModel.measurementSymbols;
        const activeMeasurement = event.detail.activeMeasurement;
        if (!activeMeasurement) {
            this._clearMeasurementHighlights();
            return;
        }
        const wkid = activeMeasurement.crs.properties.name.replace(
            "EPSG:",
            ""
        );
        const feature = activeMeasurement.features[0];
        const heightMeasurement =
            feature.properties.customGeometryType === "Height";

        const derivedData = feature.properties.derivedData;
        const transformedGeometry = this._getMeasurementGeometry(
            feature.geometry,
            wkid
        );
        if (transformedGeometry) {
            this._highlightMeasurement(
                transformedGeometry,
                symbols,
                derivedData,
                i18n,
                heightMeasurement
            );
        }
        return activeMeasurement.features;
    }

    _getMeasurementGeometry(geometry, wkid) {
        const transformer = this._transformer;
        let transformedGeometry;
        try {
            transformedGeometry = transformer.geojsonToGeometry(geometry);
        } catch (error) {
            console.error(error);
        }
        if (!transformedGeometry) {
            return;
        }
        transformedGeometry.spatialReference = new SpatialReference({
            wkid: wkid
        });
        return transformedGeometry;
    }

    _highlightMeasurement(geometry, symbols, derivedData, i18n, heightMeasurement) {
        if (heightMeasurement) {
            geometry = geometry.extent ? geometry.extent.center : geometry;
        }
        this._clearMeasurementHighlights();
        this.#highlights.push(
            this._highlighter.highlight({
                geometry: geometry,
                symbol: symbols[geometry.type]
            })
        );
        if (derivedData.totalLength?.value) {
            const textsymbol = Object.assign({}, symbols.text);
            const measurementTitle = heightMeasurement
                ? i18n.height
                : i18n.length;
            textsymbol.text =
                measurementTitle +
                ": " +
                derivedData.totalLength.value.toFixed(2) +
                " " +
                derivedData.unit;
            textsymbol.yoffset = 8;
            this.#highlights.push(
                this._highlighter.highlight({
                    geometry: geometry.extent
                        ? geometry.extent.center
                        : geometry,
                    symbol: textsymbol
                })
            );
        }
        if (derivedData.area?.value) {
            const textsymbol = Object.assign({}, symbols.text);
            textsymbol.text =
                i18n.area +
                ": " +
                derivedData.area.value.toFixed(2) +
                " " +
                derivedData.unit +
                "²";
            textsymbol.yoffset = -8;
            this.#highlights.push(
                this._highlighter.highlight({
                    geometry: geometry.extent.center,
                    symbol: textsymbol
                })
            );
        }
    }

    _clearMeasurementHighlights() {
        if (this.#highlights?.length) {
            this.#highlights.forEach(highlight => {
                highlight.remove();
            });
            this.#highlights = [];
        }
    }

}
