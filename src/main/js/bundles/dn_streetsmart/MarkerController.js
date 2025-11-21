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
import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@arcgis/core/Graphic";

export default class MarkerController {

    #sketchViewModel = null;
    #graphicsLayer = null;
    #markerGraphic = null;
    #angle = 0;
    #state = "normal";
    #pointerMoveWatcher = null;
    #sketchViewModelWatcher = null;

    activate() {
        this._getView().then((view) => {
            const graphicsLayer = this.#graphicsLayer = new GraphicsLayer({
                id: "streetSmartMarkerGraphicLayer",
                title: "StreetSmartMarkerGraphicLayer",
                listMode: "hide",
                internal: true
            });
            this._mapWidgetModel.map.layers.add(graphicsLayer);

            this.#sketchViewModel = new SketchViewModel({
                layer: graphicsLayer,
                view: view,
                updateOnGraphicClick: true
            });

        });
    }

    deactivate() {
        this._removeMarker();
        this._removeWatcher();
        this.#sketchViewModel = null;
        this.#graphicsLayer = null;
        this.#markerGraphic = null;
        this.#angle = 0;
        this.#state = "normal";
    }

    disableUpdateOnGraphicClick() {
        this.#sketchViewModel.updateOnGraphicClick = false;
    }

    activateMarker() {
        this._registerWatcher();
        this._mapWidgetModel.map.reorder(this.#graphicsLayer, 999);
    }

    deactivateMarker() {
        this._removeMarker();
        this._removeWatcher();
    }

    drawMarker(point, angle) {
        if (this.#markerGraphic && point) {
            const mg = this.#markerGraphic;
            if (mg.geometry.x === point.x && mg.geometry.y === point.y) {
                return;
            }
        }
        if (!this.#markerGraphic) {
            this.#markerGraphic = this._addMarkerToGraphicsLayer(point);
        }
        const markerGraphic = this.#markerGraphic;
        if (point) {
            markerGraphic.geometry = point;
        }
        if (angle !== undefined && angle !== null) {
            this.#angle = angle;
        }
        markerGraphic.symbol = this._getSymbol(this.#state, angle);
    }

    _removeMarker() {
        this.#sketchViewModel.complete();
        this.#graphicsLayer.removeAll();
        this.#markerGraphic = null;
        this._mapWidgetModel.view.cursor = "default";
    }

    getSketchViewModel() {
        return this.#sketchViewModel;
    }

    getPosition() {
        return this.#markerGraphic?.geometry;
    }

    _addMarkerToGraphicsLayer(point) {
        const markerGraphic = this._graphic = new Graphic({
            symbol: this._getSymbol("normal"),
            geometry: point
        });
        this.#graphicsLayer.graphics.add(markerGraphic);
        return markerGraphic;
    }

    _getSymbol(state, angle) {
        const symbols = this._streetSmartModel.markerSymbols;
        const symbol = symbols[state];
        if (angle !== undefined && angle !== null) {
            symbol.angle = angle;
        }
        return symbol;
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

    _registerWatcher() {
        this._addPointerMoveHandler();
        this._addSketchViewModelWatcher();
    }

    _removeWatcher() {
        if (this.#pointerMoveWatcher) {
            this.#pointerMoveWatcher.remove();
            this.#pointerMoveWatcher = null;
        }
        if (this.#sketchViewModelWatcher) {
            this.#sketchViewModelWatcher.remove();
            this.#sketchViewModelWatcher = null;
        }
    }

    _addSketchViewModelWatcher() {
        const sketchViewModel = this.#sketchViewModel;
        this.#sketchViewModelWatcher = sketchViewModel.on("update", evt => {
            if (!this.#markerGraphic) {
                return;
            }
            if (evt.state === "start") {
                this.#state = "available";
                this.#markerGraphic.symbol = this._getSymbol("available", this.#angle);
            } else if (evt.state === "active" && evt.toolEventInfo?.type === "move-start") {
                this.#state = "dragging";
                this.#markerGraphic.symbol = this._getSymbol("dragging", this.#angle);
            } else if (evt.state === "active" && evt.toolEventInfo?.type === "move-stop") {
                this.#state = "available";
                this.#markerGraphic.symbol = this._getSymbol("available", this.#angle);
            } else if (evt.state === "complete") {
                this.#state = "normal";
                this.#markerGraphic.symbol = this._getSymbol("normal", this.#angle);
            }
        });
    }

    _addPointerMoveHandler() {
        const view = this._mapWidgetModel.view;
        const streetSmartLayerId = this._streetSmartModel.streetSmartLayerId;
        this.#pointerMoveWatcher = view.on("pointer-move", (event) => {
            view.hitTest(event).then(response => {
                const results = response.results;
                if (results.length > 0) {
                    for (let i = 0; i < results.length; i++) {
                        // Check if we are already editing a graphic
                        if (results[i].graphic.layer && (results[i].graphic.layer.id === "streetSmartMarkerGraphicLayer"
                            || results[i].graphic.layer.id === streetSmartLayerId)) {
                            view.cursor = "pointer";
                            break;
                        } else {
                            view.cursor = "default";
                        }
                    }
                } else {
                    view.cursor = "default";
                }
            });
        });
    }

}
