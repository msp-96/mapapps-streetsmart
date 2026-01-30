[![devnet-bundle-snapshot](https://github.com/conterra/mapapps-streetsmart/actions/workflows/devnet-bundle-snapshot.yml/badge.svg)](https://github.com/conterra/mapapps-streetsmart/actions/workflows/devnet-bundle-snapshot.yml)
![Static Badge](https://img.shields.io/badge/requires_map.apps-4.20.0-e5e5e5?labelColor=%233E464F&logoColor=%23e5e5e5)
![Static Badge](https://img.shields.io/badge/tested_for_map.apps-4.20.0-%20?labelColor=%233E464F&color=%232FC050)
# Street Smart Bundle
The Street Smart Bundle uses the Cyclorama functionality to allow the user to select a location on the map and see Street Smart images for that location in a separated window.

## Sample app
https://demos.conterra.de/mapapps/resources/apps/internal_demo_streetsmart/index.html

## Installation guide
1. Add the bundle `dn_streetsmart` to your app.
2. Set your streetsmart credentials in the app.json.

## Development guide
Run the following commands from the project root directory to start a local development server:

```bash
# install all required node modules
$ mvn initialize

# start dev server
$ mvn compile -Denv=dev -Pinclude-mapapps-deps

# run unit tests
$ mvn test -P run-js-tests,include-mapapps-deps
```
