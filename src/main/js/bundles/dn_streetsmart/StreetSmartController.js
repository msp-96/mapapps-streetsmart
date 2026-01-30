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
import Point from "@arcgis/core/geometry/Point";
import dijitRegistry from "dijit/registry";
import async from "apprt-core/async";

export class StreetSmartController {

    #streetSmartAPI = null;
    #streetSmartWatcher = null;
    #streetSmartProperties = null;
    #clickWatcher = null;
    #markerWatcher = null;
    #mapViewCenterWatcher = null;
    #panorama = null;
    #initialViewPadding = null;
    #firstOpen = true;
    #mapCenterLocationChanged = false;
    #streetSmartLocationChanged = false;

    activate() {
        this.#streetSmartWatcher = [];
        this.#streetSmartProperties = this._streetSmartModel.streetSmartProperties;
    }

    deactivate() {
        this.#streetSmartAPI = null;
        this.#panorama = null;
        this.#streetSmartProperties = null;
        this._removeWatcher();
    }

    activateStreetSmart(event) {
        const minScale = this._streetSmartModel.minScale;

        this._getView().then((view) => {
            if (minScale) {
                view.constraints.minScale = minScale;
            }

            const api = this.#streetSmartAPI;
            if (api && api.getApiReadyState()) {
                this._showStreetSmart(event);
            } else {
                async(() => {
                    this.activateStreetSmart(event);
                }, 500);
            }

            this.tool.set("visibility", true);
        });
    }

    deactivateStreetSmart() {
        this.#firstOpen = true;
        this._removeWatcher();
        this._setProcessingStreetSmart(false);
        this._setStreetSmartLayerVisibility(false);

        this._measurementController.removeMeasurements();
        this._markerController.deactivateMarker();

        const minScale = this._streetSmartModel.minScale;
        if (minScale) {
            this._getView().then((view) => {
                view.constraints.minScale = 0;
            });
        }

        const templateBorderContainer = dijitRegistry.byId("templateBorderContainer");
        if (!templateBorderContainer) {
            const view = this._mapWidgetModel.view;
            if (this.#initialViewPadding) {
                view.padding = this.#initialViewPadding;
                this.#initialViewPadding = null;
            }
            this.tool.set("visibility", false);
            return;
        }
        const streetSmartDiv = document.getElementsByClassName("dn_streetsmart__container");
        if (streetSmartDiv.length) {
            streetSmartDiv[0].classList.remove("active");
        }
        templateBorderContainer.resize();

        this.tool.set("visibility", false);
    }

    initStreetSmartAPI(streetSmartAPI, streetSmartDiv) {
        this._setProcessingStreetSmart(true);
        this.#streetSmartAPI = streetSmartAPI;
        const streetSmartProperties = this.#streetSmartProperties;
        streetSmartAPI.init({
            targetElement: streetSmartDiv,
            username: streetSmartProperties.username,
            password: streetSmartProperties.password,
            apiKey: streetSmartProperties.apiKey,
            srs: streetSmartProperties.srs,
            locale: streetSmartProperties.locale,
            overlayDrawDistance: streetSmartProperties.overlayDrawDistance,
            addressSettings: streetSmartProperties.addressSettings
        }).then(() => {
            console.info("StreetSmart API initialized");
            const tool = this._tool;
            if (tool?.active) {
                this._openPanorama();
            }
        }, err => {
            const msg = err.stack.toString();
            this._logger.error(msg);
            this._setProcessingStreetSmart(false);
            console.error("Api: init: failed. Error: ", err);
        });
    }

    _showStreetSmart(event) {
        this._tool = event?.tool;
        this._createMarker();
        this._openPanorama();
        this._setStreetSmartLayerVisibility(true);
        this._registerWatcher();

        const templateBorderContainer = dijitRegistry.byId("templateBorderContainer");
        if (!templateBorderContainer) {
            const view = this._mapWidgetModel.view;
            this.#initialViewPadding = view.padding;
            view.padding.right = view.width / 2;
            return;
        }
        const streetSmartDiv = document.getElementsByClassName("dn_streetsmart__container");
        if (streetSmartDiv.length) {
            streetSmartDiv[0].classList.add("active");
        }
        templateBorderContainer.resize();
    }

    _openPanorama(point) {
        if (!this.#streetSmartAPI) {
            return;
        }

        const mapWidgetModel = this._mapWidgetModel;

        if (!point) {
            point = mapWidgetModel.center;
        }
        this._getCoordinates(point).then((coordinates) => {
            const properties = this._streetSmartModel;
            const viewerType = this.#streetSmartAPI?.ViewerType?.PANORAMA;
            const srs = properties.srs;

            this.#streetSmartAPI.open(coordinates, {
                viewerType: viewerType,
                srs: srs,
                panoramaViewer: {
                    replace: true,
                    closable: false,
                    maximizable: this.#streetSmartProperties.panoramaViewerMaximizable
                }
            }).then(
                result => {
                    if (!this._tool?.active) {
                        return;
                    }
                    const model = this._streetSmartModel;

                    if (result.length) {
                        const panorama = this.#panorama = result[0];
                        const recording = panorama.props.recording;
                        this._updateMarkerPosition(recording);
                        if (model.useMapCenterLocation) {
                            const view = mapWidgetModel.view;
                            this._getPoint(recording).then(point => {
                                const center = view.center;
                                if (center.x !== point.x || center.y !== point.y) {
                                    view.center = point;
                                }
                            });
                        }
                        if (this.#firstOpen) {
                            this.#firstOpen = false;
                            this._registerWatcher();
                            this._panoramaViewerCustomMethod(panorama);
                        }
                        this._setProcessingStreetSmart(false);
                    } else {
                        this._logger.warn(
                            "No imagery is available at this location."
                        );
                        console.warn(
                            "No imagery is available at this location."
                        );
                        if (model.closeOnNoData) {
                            this.deactivateStreetSmart();
                        }
                        this._setProcessingStreetSmart(false);
                    }
                }
            ).catch(reason => {
                this._setProcessingStreetSmart(false);
                this._logger.error({
                    message: reason.toString()
                });
                console.error("Error opening panorama viewer: " + reason);
            });
        });
    }

    _setStreetSmartLayerVisibility(visible) {
        const streetSmartLayerId = this._streetSmartModel.streetSmartLayerId;
        if (streetSmartLayerId) {
            const streetSmartLayer = this._mapWidgetModel.map.findLayerById(streetSmartLayerId);
            if (streetSmartLayer) {
                streetSmartLayer.visible = visible;
            }
        }
    }

    _panoramaViewerCustomMethod(panorama) {
        const streetSmartProperties = this.#streetSmartProperties;
        const panoramaViewerInstance = streetSmartProperties.panoramaViewerInstance;
        if (panoramaViewerInstance && panoramaViewerInstance.method && panoramaViewerInstance.parameters) {
            const srs = panorama.props.recording.srs;

            const coordinate = panoramaViewerInstance.parameters.coordinate;
            const imageId = panoramaViewerInstance.parameters.imageId;
            const query = panoramaViewerInstance.parameters.query;
            const recording = panorama.props.recording;
            switch (panoramaViewerInstance.method) {
                case "lookAtCoordinate":
                    if (!coordinate) {
                        return;
                    }
                    panorama.lookAtCoordinate(coordinate, srs);
                    this._updateMarkerPosition(recording);
                    break;
                case "openByCoordinate":
                    if (!coordinate) {
                        return;
                    }
                    panorama.openByCoordinate(coordinate, srs).then(recording => {
                        this._updateMarkerPosition(recording);
                    });
                    break;
                case "openByAddress":
                    if (!query) {
                        return;
                    }
                    panorama.openByAddress(query, srs).then(recording => {
                        this._updateMarkerPosition(recording);
                    });
                    break;
                case "openByImageId":
                    if (!imageId) {
                        return;
                    }
                    panorama.openByImageId(imageId, srs).then(recording => {
                        this._updateMarkerPosition(recording);
                    });
                    break;
            }
        }
    }

    _registerWatcher() {
        const model = this._streetSmartModel;
        const panorama = this.#panorama;

        if (panorama) {
            this.#clickWatcher = this._connectOnClickEvent();
            this.#markerWatcher = this._connectOnSketchViewModel();
            this.#streetSmartWatcher.push(this._connectToMeasurementEvent());
            this._connectToStreetSmartAPIEvents(panorama);

            if (model.useMapCenterLocation && !this.#mapViewCenterWatcher) {
                this.#mapViewCenterWatcher = this._connectMapViewCenterWatcher();
            }
        }
    }

    _removeWatcher() {
        this.#streetSmartWatcher.forEach((watcher) => {
            watcher?.removeListener();
        });
        this.#streetSmartWatcher = [];
        this.#clickWatcher?.remove();
        this.#clickWatcher = null;
        this.#markerWatcher?.remove();
        this.#markerWatcher = null;
        this.#mapViewCenterWatcher?.remove();
        this.#mapViewCenterWatcher = null;
    }

    _setProcessingStreetSmart(processing) {
        const tool = this._tool;
        if (tool) {
            tool.set("processing", processing);
        }
    }

    _createMarker() {
        const model = this._streetSmartModel;
        const mapWidgetModel = this._mapWidgetModel;

        mapWidgetModel.view.scale = model.initialViewScale || 2500;
        const center = mapWidgetModel.center;

        const markerController = this._markerController;
        markerController.activateMarker();
        markerController.drawMarker(center, 0);
    }

    _connectOnClickEvent() {
        const view = this._mapWidgetModel.view;
        const streetSmartLayerId = this._streetSmartModel.streetSmartLayerId;
        return view.on("click", event => {
            view.hitTest(event).then(response => {
                const results = response.results;
                if (response.results.length > 0) {
                    //proof that the event was not triggered on the marker's graphic.
                    const clickOnMarker = response.results.some(result => {
                        const graphic = result.graphic;
                        return graphic.layer?.id === "streetSmartMarkerGraphicLayer";
                    });
                    if (!clickOnMarker && streetSmartLayerId) {
                        for (let i = 0; i < results.length; i++) {
                            // Check if the graphic belongs to the cyclorama point layer and open the new panorama images
                            const graphic = results[i].graphic;
                            if (graphic.layer?.id === streetSmartLayerId) {
                                const point = graphic.geometry;
                                this._openPanorama(point);
                                break;
                            }
                        }
                    }
                }
            });
        });
    }

    _connectOnSketchViewModel() {
        const markerController = this._markerController;
        return markerController.getSketchViewModel().on("update", event => {
            const toolType = event?.toolEventInfo?.type;
            if (toolType === "move-stop") {
                const point = this._markerController.getPosition();
                if (!point) {
                    return;
                }
                if (this._tool?.active) {
                    this._openPanorama(point);
                }
            }
        });
    }

    _connectMapViewCenterWatcher() {
        const view = this._mapWidgetModel.view;
        const model = this._streetSmartModel;
        const markerController = this._markerController;

        return view.watch("center", (center) => {
            if (center && !this.#streetSmartLocationChanged) {
                if (this._tool?.active) {
                    markerController.drawMarker(view.center, null);
                }

                this.#mapCenterLocationChanged = true;
                clearTimeout(this.lastTimeout);
                this.lastTimeout = setTimeout(() => {
                    this.#mapCenterLocationChanged = false;
                    this.#streetSmartLocationChanged = true;
                    this._openPanorama(view.center);
                }, model.mapCenterLocationDelay);
            } else if (this.#streetSmartLocationChanged) {
                clearTimeout(this.lastTimeout);
                this.lastTimeout = setTimeout(() => {
                    this.#streetSmartLocationChanged = false;
                }, model.mapCenterLocationDelay);
            }
        });
    }

    _connectToStreetSmartAPIEvents(panorama) {
        const model = this._streetSmartModel;
        this.#streetSmartWatcher.push(panorama.on("VIEW_CHANGE", event => {
            const angle = event.detail.yaw;
            this._markerController.drawMarker(null, angle);
        }));
        this.#streetSmartWatcher.push(panorama.on("RECORDING_CLICK", event => {
            this._updateMarkerPosition(event.detail.recording);
            this.#streetSmartLocationChanged = true;
            clearTimeout(this.lastTimeout);
            this.lastTimeout = setTimeout(() => {
                this.#streetSmartLocationChanged = false;
            }, model.mapCenterLocationDelay);
        }));
    }

    _connectToMeasurementEvent() {
        return this.#streetSmartAPI.on("MEASUREMENT_CHANGED", event => {
            const measurementFeatures = this._measurementController.drawMeasurement(event);

            if (this._streetSmartModel.useMapCenterLocation) return;
            if (measurementFeatures?.length === 1) {
                this._centerOnMarker(250);
            }
        });
    }

    _updateMarkerPosition(recording) {
        this._getPoint(recording).then((point) => {
            this._markerController.drawMarker(point, null);

            if(this.#mapCenterLocationChanged) {
                return;
            }
            this._centerOnMarker();
        });
    }

    _getPoint(recording) {
        const srs = this.#streetSmartProperties.srs;
        const wkid = srs.split(":")[1];
        const targetWkid = this._mapWidgetModel.spatialReference.wkid;

        const xyz = recording.xyz;
        const x = xyz[0];
        const y = xyz[1];
        const point = new Point({
            x: x,
            y: y,
            spatialReference: {
                wkid: wkid
            }
        });
        return this._coordinateTransformer.transform(
            point,
            targetWkid
        ).then((transformedPoint) => transformedPoint);
    }

    _getCoordinates(point) {
        const srs = this.#streetSmartProperties.srs;
        const targetWkid = srs.split(":")[1];
        return this._coordinateTransformer.transform(
            point,
            targetWkid
        ).then((transformedPoint) => {
            const x = transformedPoint.x.toString();
            const y = transformedPoint.y.toString();
            return x + " , " + y;
        });
    }

    _centerOnMarker(scale) {
        const point = this._markerController.getPosition();
        if (!point) {
            return;
        }
        const mapWidgetModel = this._mapWidgetModel;
        mapWidgetModel.center = point;
        if (scale) {
            mapWidgetModel.scale = scale;
        }
    }

    _getView() {
        const mapWidgetModel = this._mapWidgetModel;
        return new Promise((resolve, reject) => {
            if (mapWidgetModel.view) {
                resolve(mapWidgetModel.view);
            } else {
                mapWidgetModel.watch("view", ({ value: view }) => {
                    resolve(view);
                });
            }
        });
    }

    setTool(tool) {
        this.tool = tool;
        this.setStreetSmartMode(this._streetSmartModel.useMapCenterLocation);
    }

    toggleStreetSmartMode() {
        this.setStreetSmartMode(! this._streetSmartModel.useMapCenterLocation);
    }

    setStreetSmartMode(mode) {
        const model = this._streetSmartModel;
        const tool = this.tool;
        const i18n = this._i18n.get().ui;

        model.useMapCenterLocation = mode;
        if (mode) {
            tool.set("iconClass", "icon-cursor");
            tool.set("tooltip", i18n.tooltips.mousePosition);
            tool.set("title", i18n.titles.mousePosition);
        }
        else {
            tool.set("iconClass", "icon-locate-position");
            tool.set("tooltip", i18n.tooltips.mapCenter);
            tool.set("title", i18n.titles.mapCenter);
        }

        this._removeWatcher();
        this._registerWatcher();
    }

}
