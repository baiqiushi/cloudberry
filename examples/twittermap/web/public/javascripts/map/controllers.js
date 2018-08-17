angular.module('cloudberry.map', ['leaflet-directive', 'cloudberry.common','cloudberry.cache'])
  .controller('MapCtrl', function($scope, $http, cloudberry, leafletData,
                                  cloudberryConfig, Cache, moduleManager) {

    cloudberry.parameters.maptype = config.defaultMapType;

    // add an alert bar of IE
    if (L.Browser.ie) {
      var alertDiv = document.getElementsByTagName("alert-bar")[0];
      var div = L.DomUtil.create('div', 'alert alert-warning alert-dismissible')
      div.innerHTML = [
        '<a href="#" class="close" data-dismiss="alert" aria-label="close">&times;</a>',
        '<strong>Warning! </strong> TwitterMap currently doesn\'t support IE.'
      ].join('');
      div.style.position = 'absolute';
      div.style.top = '0%';
      div.style.width = '100%';
      div.style.zIndex = '9999';
      div.style.fontSize = '23px';
      alertDiv.appendChild(div);
    }

    $scope.result = {};
    $scope.doNormalization = false;
    $scope.doSentiment = false;
    $scope.infoPromp = config.mapLegend;
    $scope.cityIdSet = new Set();

    // setting default map styles, zoom level, etc.
    angular.extend($scope, {
      tiles: {
        name: 'Mapbox',
        url: 'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}',
        type: 'xyz',
        options: {
          accessToken: 'pk.eyJ1IjoiamVyZW15bGkiLCJhIjoiY2lrZ2U4MWI4MDA4bHVjajc1am1weTM2aSJ9.JHiBmawEKGsn3jiRK_d0Gw',
          id: 'jeremyli.p6f712pj'
        }
      },
      controls: {
        custom: []
      },
      geojsonData: {},
      polygons: {},
      status: {
        init: true,
        zoomLevel: 4,
        logicLevel: 'state'
      },
      styles: {
        initStyle: {
          weight: 1.5,
          fillOpacity: 0.5,
          color: 'white'
        },
        stateStyle: {
          fillColor: '#f7f7f7',
          weight: 1.5,
          opacity: 1,
          color: '#92d1e1',
          fillOpacity: 0.5
        },
        stateUpperStyle: {
          fillColor: '#f7f7f7',
          weight: 1.5,
          opacity: 1,
          color: '#92d1e1',
          fillOpacity: 0.5
        },
        countyStyle: {
          fillColor: '#f7f7f7',
          weight: 1.5,
          opacity: 1,
          color: '#92d1e1',
          fillOpacity: 0.5
        },
        countyUpperStyle: {
          fillColor: '#f7f7f7',
          weight: 1.5,
          opacity: 1,
          color: '#92d1e1',
          fillOpacity: 0.5
        },
        cityStyle: {
          fillColor: '#f7f7f7',
          weight: 1.5,
          opacity: 1,
          color: '#92d1e1',
          fillOpacity: 0.5
        },
        hoverStyle: {
          weight: 5,
          color: '#666',
          fillOpacity: 0.5
        },
        colors: [ '#ffffff', '#92d1e1', '#4393c3', '#2166ac', '#f4a582', '#d6604d', '#b2182b'],
        sentimentColors: ['#ff0000', '#C0C0C0', '#00ff00']
      }
    });
    
    // set map styles
    $scope.setStyles = function setStyles(styles) {
      $scope.styles = styles;
    };

    // find the geoIds of the polygons that are within a given bounding box
    $scope.resetGeoIds = function resetGeoIds(bounds, polygons, idTag) {
      cloudberry.parameters.geoIds = [];
      if (polygons != undefined) {
        polygons.features.forEach(function (polygon) {
          if (bounds._southWest.lat <= polygon.properties.centerLat &&
              polygon.properties.centerLat <= bounds._northEast.lat &&
              bounds._southWest.lng <= polygon.properties.centerLog &&
              polygon.properties.centerLog <= bounds._northEast.lng) {
              cloudberry.parameters.geoIds.push(polygon.properties[idTag]);
          }
        });
      }
    };

    // reset the geo level (state, county, city)
    $scope.resetGeoInfo = function resetGeoInfo(level) {
      $scope.status.logicLevel = level;
      cloudberry.parameters.geoLevel = level;
      if ($scope.geojsonData[level])
        $scope.resetGeoIds($scope.bounds, $scope.geojsonData[level], level + 'ID');
    };


    // initialize the leaflet map
    $scope.init = function() {
      leafletData.getMap().then(function(map) {
        $scope.map = map;
        $scope.bounds = map.getBounds();
        //making attribution control to false to remove the default leaflet sign in the bottom of map
        map.attributionControl.setPrefix(false);
        map.setView([$scope.lat, $scope.lng],$scope.zoom);
      });

      //Reset Zoom Button
      var button = document.createElement("a");
      var text =  document.createTextNode("Reset");
      button.appendChild(text);
      button.title = "Reset";
      button.href = "#";
      button.style.position = 'inherit';
      button.style.top = '150%';
      button.style.left = '-53%';
      var body = document.getElementsByTagName("search-bar")[0];
      body.appendChild(button);
      button.addEventListener ("click", function() {
        $scope.map.setView([$scope.lat, $scope.lng], 4);
      });

      $scope.resetGeoInfo("state");
    };
    
    // redraw the polygons with the new map styles
    $scope.resetPolygonLayers = function resetPolygonLayers() {
      if ($scope.polygons.statePolygons) {
        $scope.polygons.statePolygons.setStyle($scope.styles.stateStyle);
      }
      if ($scope.polygons.countyPolygons) {
        $scope.polygons.countyPolygons.setStyle($scope.styles.countyStyle);
      }
      if ($scope.polygons.cityPolygons) {
        $scope.polygons.cityPolygons.setStyle($scope.styles.cityStyle);
      }
      if ($scope.polygons.stateUpperPolygons) {
        $scope.polygons.stateUpperPolygons.setStyle($scope.styles.stateUpperStyle);
      }
      if ($scope.polygons.countyUpperPolygons) {
        $scope.polygons.countyUpperPolygons.setStyle($scope.styles.countyUpperStyle);
      }
    };

    // update the center and the boundary of the visible area of the map
    function setCenterAndBoundry(features) {

      for(var id in features){
        var minLog = Number.POSITIVE_INFINITY;
        var maxLog = Number.NEGATIVE_INFINITY;
        var minLat = Number.POSITIVE_INFINITY;
        var maxLat = Number.NEGATIVE_INFINITY;
        if(features[id].geometry.type === "Polygon") {
          features[id].geometry.coordinates[0].forEach(function(pair) {
            minLog = Math.min(minLog, pair[0]);
            maxLog = Math.max(maxLog, pair[0]);
            minLat = Math.min(minLat, pair[1]);
            maxLat = Math.max(maxLat, pair[1]);
          });
        } else if( features[id].geometry.type === "MultiPolygon") {
          features[id].geometry.coordinates.forEach(function(array){
            array[0].forEach(function(pair){
              minLog = Math.min(minLog, pair[0]);
              maxLog = Math.max(maxLog, pair[0]);
              minLat = Math.min(minLat, pair[1]);
              maxLat = Math.max(maxLat, pair[1]);
            });
          });
        }
        features[id].properties["centerLog"] = (maxLog + minLog) / 2;
        features[id].properties["centerLat"] = (maxLat + minLat) / 2;
      }
    }
    
    // load geoJson to get state and county polygons
    $scope.loadGeoJsonFiles = function loadGeoJsonFiles(onEachFeature) {
      if (typeof($scope.polygons.statePolygons) === "undefined" || $scope.polygons.statePolygons == null){
        $http.get("assets/data/state.json")
        .success(function(data) {
          $scope.geojsonData.state = data;
          $scope.polygons.statePolygons = L.geoJson(data, {
            style: $scope.styles.stateStyle,
            onEachFeature: onEachFeature
          });
          $scope.polygons.stateUpperPolygons = L.geoJson(data, {
            style: $scope.styles.stateUpperStyle
          });
          setCenterAndBoundry($scope.geojsonData.state.features);
          $scope.polygons.statePolygons.addTo($scope.map);
        })
        .error(function(data) {
          console.error("Load state data failure");
        });
      }
      if (typeof($scope.polygons.countyPolygons) === "undefined" || $scope.polygons.countyPolygons == null){
        $http.get("assets/data/county.json")
        .success(function(data) {
          $scope.geojsonData.county = data;
          $scope.polygons.countyPolygons = L.geoJson(data, {
            style: $scope.styles.countyStyle,
            onEachFeature: onEachFeature
          });
          $scope.polygons.countyUpperPolygons = L.geoJson(data, {
            style: $scope.styles.countyUpperStyle
          });
          setCenterAndBoundry($scope.geojsonData.county.features);
        })
        .error(function(data) {
          console.error("Load county data failure");
        });
      }
    };

    // load geoJson to get city polygons
    $scope.loadCityJsonByBound = function loadCityJsonByBound(onEachFeature, fromEventName, fromEvent){

      var bounds = $scope.map.getBounds();
      var rteBounds = "city/" + bounds._northEast.lat + "/" + bounds._southWest.lat + "/" + bounds._northEast.lng + "/" + bounds._southWest.lng;

        // Caching feature only works when the given threshold is greater than zero.
        if (cloudberryConfig.cacheThreshold > 0) {
          Cache.getCityPolygonsFromCache(rteBounds).done(function(data) {

            //set center and boundary done by Cache
            if (!$scope.status.init) {
              $scope.resetGeoIds($scope.bounds, data, 'cityID');
              cloudberry.parameters.geoLevel = 'city';
              // Publish zoom/drag event to moduleManager
              moduleManager.publishEvent(fromEventName, fromEvent);
            }

            $scope.status.logicLevel = 'city';

            // initializes the $scope.geojsonData.city and $scope.cityIdSet when first time zoom in
            if(typeof $scope.polygons.cityPolygons === 'undefined'){
              $scope.geojsonData.city = data;
              $scope.polygons.cityPolygons = L.geoJson(data, {
                style: $scope.styles.cityStyle,
                onEachFeature: onEachFeature
              });

              for (i = 0; i < $scope.geojsonData.city.features.length; i++) {
                $scope.cityIdSet.add($scope.geojsonData.city.features[i].properties.cityID);
              }
            } else {
              // compares the current region's cityIds with previously stored cityIds
              // stores the new delta cities' ID and polygon info
              // add the new polygons as GeoJson objects incrementally on the layer

              for (i = 0; i < data.features.length; i++) {
                if (!$scope.cityIdSet.has(data.features[i].properties.cityID)) {
                  $scope.geojsonData.city.features.push(data.features[i]);
                  $scope.cityIdSet.add(data.features[i].properties.cityID);
                  $scope.polygons.cityPolygons.addData(data.features[i]);
                }
              }
            }

            // To add the city level map only when it doesn't exit
            if(!$scope.map.hasLayer($scope.polygons.cityPolygons)){
              $scope.map.addLayer($scope.polygons.cityPolygons);
            }
          });
        } else {
          // No caching used here.
          $http.get(rteBounds)
            .success(function (data) {
              $scope.geojsonData.city = data;
              if ($scope.polygons.cityPolygons) {
                $scope.map.removeLayer($scope.polygons.cityPolygons);
              }
              $scope.polygons.cityPolygons = L.geoJson(data, {
                style: $scope.styles.cityStyle,
                onEachFeature: onEachFeature
              });
              setCenterAndBoundry($scope.geojsonData.city.features);
              $scope.resetGeoInfo("city");
              if (!$scope.status.init) {
                // Publish zoom/drag event to moduleManager
                moduleManager.publishEvent(fromEventName, fromEvent);
              }
              $scope.map.addLayer($scope.polygons.cityPolygons);
            })
            .error(function (data) {
              console.error("Load city data failure");
            });
        }
    };
    
    // zoom in to fit the selected polygon
    $scope.zoomToFeature = function zoomToFeature(leafletEvent) {
      if (leafletEvent)
        $scope.map.fitBounds(leafletEvent.target.getBounds());
    };
    
    // For randomize coordinates by bounding_box
    var randomizationSeed;

    // javascript does not provide API for setting seed for its random function, so we need to implement it ourselves.
    function CustomRandom() {
      var x = Math.sin(randomizationSeed++) * 10000;
      return x - Math.floor(x);
    }

    // return a random number with normal distribution
    function randomNorm(mean, stdev) {
      return mean + (((CustomRandom() + CustomRandom() + CustomRandom() + CustomRandom() + CustomRandom() + CustomRandom()) - 3) / 3) * stdev;
    }

    // randomize a pin coordinate for a tweet according to the bounding box (normally distributed within the bounding box) when the actual coordinate is not availalble.
    // by using the tweet id as the seed, the same tweet will always be randomized to the same coordinate.
    $scope.rangeRandom = function rangeRandom(seed, minV, maxV){
      randomizationSeed = seed;
      var ret = randomNorm((minV + maxV) / 2, (maxV - minV) / 16);
      return ret;
    };

    $scope.onEachFeature = null;

    // Listens to Leaflet's zoomend event and publish it to moduleManager
    $scope.$on("leafletDirectiveMap.zoomend", function() {

      // Original operations on zoomend event
      if ($scope.map) {
        $scope.status.zoomLevel = $scope.map.getZoom();
        $scope.bounds = $scope.map.getBounds();
        if ($scope.status.zoomLevel > 9) {
          $scope.resetGeoInfo("city");
          if ($scope.polygons.statePolygons) {
            $scope.map.removeLayer($scope.polygons.statePolygons);
          }
          if ($scope.polygons.countyPolygons) {
            $scope.map.removeLayer($scope.polygons.countyPolygons);
          }
          if ($scope.polygons.stateUpperPolygons) {
            $scope.map.removeLayer($scope.polygons.stateUpperPolygons);
          }
          $scope.map.addLayer($scope.polygons.countyUpperPolygons);
          $scope.loadCityJsonByBound($scope.onEachFeature, moduleManager.EVENT.CHANGE_ZOOM_LEVEL,
            {level: $scope.map.getZoom(), bounds: $scope.map.getBounds()});
        } else if ($scope.status.zoomLevel > 5) {
          $scope.resetGeoInfo("county");
          if (!$scope.status.init) {
            // Publish zoom event to moduleManager
            moduleManager.publishEvent(moduleManager.EVENT.CHANGE_ZOOM_LEVEL, {level: $scope.map.getZoom(), bounds: $scope.map.getBounds()});
          }
          if ($scope.polygons.statePolygons) {
            $scope.map.removeLayer($scope.polygons.statePolygons);
          }
          if ($scope.polygons.cityPolygons) {
            $scope.map.removeLayer($scope.polygons.cityPolygons);
          }
          if ($scope.polygons.countyUpperPolygons) {
            $scope.map.removeLayer($scope.polygons.countyUpperPolygons);
          }
          $scope.map.addLayer($scope.polygons.stateUpperPolygons);
          $scope.map.addLayer($scope.polygons.countyPolygons);
        } else if ($scope.status.zoomLevel <= 5) {
          $scope.resetGeoInfo("state");
          if (!$scope.status.init) {
            // Publish zoom event to moduleManager
            moduleManager.publishEvent(moduleManager.EVENT.CHANGE_ZOOM_LEVEL, {level: $scope.map.getZoom(), bounds: $scope.map.getBounds()});
          }
          if ($scope.polygons.countyPolygons) {
            $scope.map.removeLayer($scope.polygons.countyPolygons);
          }
          if ($scope.polygons.cityPolygons) {
            $scope.map.removeLayer($scope.polygons.cityPolygons);
          }
          if ($scope.polygons.stateUpperPolygons) {
            $scope.map.removeLayer($scope.polygons.stateUpperPolygons);
          }
          if ($scope.polygons.countyUpperPolygons) {
            $scope.map.removeLayer($scope.polygons.countyUpperPolygons);
          }
          if ($scope.polygons.statePolygons) {
            $scope.map.addLayer($scope.polygons.statePolygons);
          }
        }
      }
    });

    // Listens to Leaflet's dragend event and publish it to moduleManager
    $scope.$on("leafletDirectiveMap.dragend", function() {

      // Original operations on dragend event
      if (!$scope.status.init) {
        $scope.bounds = $scope.map.getBounds();
        var geoData;
        if ($scope.status.logicLevel === "state") {
          geoData = $scope.geojsonData.state;
        } else if ($scope.status.logicLevel === "county") {
          geoData = $scope.geojsonData.county;
        } else if ($scope.status.logicLevel === "city") {
          geoData = $scope.geojsonData.city;
        } else {
          console.error("Error: Illegal value of logicLevel, set to default: state");
          $scope.status.logicLevel = "state";
          geoData = $scope.geojsonData.state;
        }
      }
      if ($scope.status.logicLevel === "city") {
        $scope.loadCityJsonByBound($scope.onEachFeature, moduleManager.EVENT.CHANGE_REGION_BY_DRAG,
          {bounds: $scope.map.getBounds()});
      } else {
        $scope.resetGeoIds($scope.bounds, geoData, $scope.status.logicLevel + "ID");
        cloudberry.parameters.geoLevel = $scope.status.logicLevel;
        // Publish drag event to moduleManager
        moduleManager.publishEvent(moduleManager.EVENT.CHANGE_REGION_BY_DRAG, {bounds: $scope.map.getBounds()});
      }
    });


    // Load the word count from AsterixDB limitdb
    // $http.post("http://localhost:19002/query/service", {statement:"select * from limitdb.wordcardinality;"})
    //   .success(function (data) {
    //     var results = data["results"];
    //     console.log(results);
    //     cloudberry.parameters.wordcount = results.reduce(function(map, obj) {
    //       map[obj["wordcardinality"]["word"]] = obj["wordcardinality"]["cardinality"];
    //       return map;
    //     }, {});
    //     console.log(cloudberry.parameters.wordcount);
    //   })
    //   .error(function (data) {
    //     console.error("Load word count failed!");
    //   });
    cloudberry.parameters.wordcount = {
      "act": 7152 ,
      "aerotek": 6350 ,
      "afternoon": 14767 ,
      "agent": 6010 ,
      "ago": 15538 ,
      "air": 28195 ,
      "album": 6207 ,
      "alert": 14206 ,
      "alerta": 6074 ,
      "alexandria": 7226 ,
      "also": 15937 ,
      "american": 17853 ,
      "android": 9408 ,
      "annual": 10529 ,
      "antonio": 9064 ,
      "app": 6123 ,
      "area": 20772 ,
      "arena": 9556 ,
      "arizona": 14256 ,
      "around": 24991 ,
      "art": 56223 ,
      "ast": 5032 ,
      "aurora": 10823 ,
      "austin": 38277 ,
      "away": 18884 ,
      "bakersfield": 6473 ,
      "ball": 9980 ,
      "baptist": 5570 ,
      "baro": 5620 ,
      "bay": 20481 ,
      "bday": 6607 ,
      "beach": 103457 ,
      "bedford": 5541 ,
      "beermenus": 7694 ,
      "bell": 6304 ,
      "best": 74654 ,
      "better": 32987 ,
      "beyond": 9445 ,
      "bio": 14865 ,
      "birmingham": 9580 ,
      "black": 26823 ,
      "blast": 8210 ,
      "blog": 5085 ,
      "board": 6924 ,
      "book": 16200 ,
      "boozallen": 18172 ,
      "bound": 6523 ,
      "bowl": 9993 ,
      "box": 9151 ,
      "bread": 17664 ,
      "break": 13925 ,
      "brew": 5440 ,
      "bro": 8956 ,
      "broadway": 10110 ,
      "bronx": 10052 ,
      "brooklyn": 33235 ,
      "brown": 9427 ,
      "brunch": 14851 ,
      "burlington": 6915 ,
      "buyer": 7307 ,
      "cafe": 20430 ,
      "cake": 8743 ,
      "calm": 7581 ,
      "camp": 14532 ,
      "campus": 7502 ,
      "canton": 5176 ,
      "capitol": 5523 ,
      "car": 16265 ,
      "careerarc": 1198383 ,
      "carolina": 26224 ,
      "carolinawx": 13528 ,
      "cat": 8021 ,
      "catch": 11664 ,
      "center": 100771 ,
      "central": 23976 ,
      "charleston": 10689 ,
      "chattanooga": 6057 ,
      "chi": 6884 ,
      "chicken": 14362 ,
      "child": 5808 ,
      "chili": 6906 ,
      "chill": 5714 ,
      "chris": 5288 ,
      "church": 29473 ,
      "cincinnati": 17884 ,
      "citi": 5337 ,
      "classic": 8408 ,
      "claytonnc": 13720 ,
      "clear": 71313 ,
      "clerk": 28009 ,
      "cleveland": 16424 ,
      "clinic": 8215 ,
      "close": 10354 ,
      "club": 39506 ,
      "cna": 9542 ,
      "color": 13041 ,
      "colorado": 16887 ,
      "columbia": 22829 ,
      "columbus": 33438 ,
      "concert": 12535 ,
      "connecticut": 5900 ,
      "control": 6257 ,
      "cook": 38184 ,
      "cool": 21922 ,
      "could": 322250 ,
      "court": 7711 ,
      "crab": 10893 ,
      "creek": 16373 ,
      "crew": 31298 ,
      "cross": 6298 ,
      "cup": 5532 ,
      "current": 57231 ,
      "custom": 6966 ,
      "custserv": 7518 ,
      "cut": 8792 ,
      "cute": 12407 ,
      "dad": 10248 ,
      "damn": 9780 ,
      "dark": 6962 ,
      "daughter": 7022 ,
      "day": 254430 ,
      "dearborn": 5294 ,
      "death": 5029 ,
      "deep": 6734 ,
      "def": 7537 ,
      "design": 13724 ,
      "desk": 5831 ,
      "detroit": 18004 ,
      "didn": 16511 ,
      "diego": 21502 ,
      "diem": 6240 ,
      "diesel": 5246 ,
      "direct": 5721 ,
      "director": 24274 ,
      "disneyland": 7851 ,
      "dollar": 9485 ,
      "done": 22099 ,
      "door": 6348 ,
      "dope": 6696 ,
      "drink": 11761 ,
      "drive": 32423 ,
      "driver": 68928 ,
      "dude": 6030 ,
      "durham": 8181 ,
      "eat": 12864 ,
      "edmonton": 18895 ,
      "elpaso": 6355 ,
      "est": 6318 ,
      "even": 28593 ,
      "ever": 32712 ,
      "express": 5662 ,
      "expressway": 6437 ,
      "extra": 7640 ,
      "eye": 6643 ,
      "facebook": 5468 ,
      "fam": 8039 ,
      "fan": 6549 ,
      "fargo": 9202 ,
      "farm": 8660 ,
      "feb": 14219 ,
      "feel": 19298 ,
      "field": 25947 ,
      "fight": 6561 ,
      "film": 9171 ,
      "final": 10979 ,
      "find": 21204 ,
      "fish": 8076 ,
      "fit": 607883 ,
      "five": 6086 ,
      "floor": 6218 ,
      "foodporn": 6719 ,
      "fortworth": 8368 ,
      "forward": 20324 ,
      "found": 20103 ,
      "four": 9801 ,
      "free": 39570 ,
      "freight": 6740 ,
      "fremont": 6401 ,
      "friday": 52150 ,
      "friend": 28499 ,
      "front": 17625 ,
      "fuck": 8582 ,
      "full": 59865 ,
      "fun": 74171 ,
      "game": 43744 ,
      "garden": 26893 ,
      "gate": 6788 ,
      "georgia": 24400 ,
      "get": 134676 ,
      "gift": 7828 ,
      "give": 16988 ,
      "glad": 9571 ,
      "global": 5665 ,
      "god": 26541 ,
      "golden": 12046 ,
      "gone": 7205 ,
      "grab": 5344 ,
      "grade": 7781 ,
      "graffiti": 16179 ,
      "great": 729934 ,
      "grove": 9635 ,
      "guest": 8825 ,
      "guy": 17700 ,
      "gym": 14640 ,
      "hail": 5705 ,
      "hair": 41349 ,
      "hamilton": 6421 ,
      "hampton": 5077 ,
      "hang": 5575 ,
      "harbor": 8577 ,
      "hate": 6546 ,
      "haven": 13565 ,
      "haze": 8473 ,
      "hear": 8020 ,
      "heard": 5420 ,
      "heart": 18146 ,
      "hello": 13000 ,
      "hey": 15928 ,
      "high": 44201 ,
      "hill": 21434 ,
      "hilton": 5777 ,
      "honolulu": 12631 ,
      "honor": 8630 ,
      "host": 13200 ,
      "hot": 22216 ,
      "huge": 8079 ,
      "hum": 6705 ,
      "human": 8396 ,
      "ice": 16124 ,
      "idea": 5116 ,
      "inc": 14817 ,
      "indiana": 10848 ,
      "info": 6303 ,
      "instagram": 8633 ,
      "iowa": 6142 ,
      "island": 32470 ,
      "jack": 5917 ,
      "jazz": 5040 ,
      "jobsearch": 6084 ,
      "join": 320414 ,
      "joy": 5521 ,
      "jul": 14066 ,
      "jun": 10263 ,
      "key": 9008 ,
      "king": 14823 ,
      "kingdom": 7005 ,
      "know": 61538 ,
      "labor": 45761 ,
      "land": 7259 ,
      "lane": 28296 ,
      "las": 34924 ,
      "later": 8083 ,
      "law": 7195 ,
      "leader": 15079 ,
      "leadership": 6246 ,
      "least": 6307 ,
      "lebanon": 5073 ,
      "lee": 5618 ,
      "let": 48912 ,
      "level": 16618 ,
      "lil": 12220 ,
      "lincoln": 13673 ,
      "line": 30818 ,
      "linecook": 6197 ,
      "list": 6705 ,
      "listen": 6867 ,
      "littlerock": 6961 ,
      "llc": 5964 ,
      "local": 19700 ,
      "locum": 7378 ,
      "lol": 29224 ,
      "los": 57991 ,
      "lot": 16680 ,
      "louisiana": 8321 ,
      "love": 172709 ,
      "lpn": 14014 ,
      "lubbock": 5464 ,
      "magic": 11481 ,
      "main": 15239 ,
      "make": 49634 ,
      "makeup": 7071 ,
      "mama": 5635 ,
      "man": 34257 ,
      "mar": 15287 ,
      "march": 11970 ,
      "mark": 5771 ,
      "market": 37451 ,
      "mcdonald": 7493 ,
      "mclean": 5023 ,
      "meal": 5422 ,
      "meet": 20295 ,
      "mesa": 7265 ,
      "metro": 5142 ,
      "mexican": 7127 ,
      "mexico": 7944 ,
      "miami": 64350 ,
      "might": 308877 ,
      "mile": 6978 ,
      "min": 6626 ,
      "mine": 5754 ,
      "minnesota": 7506 ,
      "mix": 5554 ,
      "model": 10379 ,
      "mon": 13840 ,
      "mood": 8029 ,
      "moon": 8285 ,
      "mother": 14363 ,
      "motor": 6889 ,
      "mount": 9364 ,
      "move": 8219 ,
      "mph": 60315 ,
      "museum": 21489 ,
      "music": 49000 ,
      "need": 38475 ,
      "neighborhood": 5862 ,
      "network": 8207 ,
      "new": 311637 ,
      "newport": 6479 ,
      "news": 11740 ,
      "newyork": 52243 ,
      "next": 40858 ,
      "nola": 5463 ,
      "non": 8905 ,
      "north": 76163 ,
      "nthis": 5502 ,
      "number": 5128 ,
      "nwe": 7295 ,
      "ocean": 13500 ,
      "officeteam": 10749 ,
      "ohio": 23269 ,
      "oklahoma": 9964 ,
      "old": 43091 ,
      "omaha": 22014 ,
      "one": 138083 ,
      "ontario": 5641 ,
      "orchard": 9228 ,
      "order": 12923 ,
      "other": 20658 ,
      "overcast": 16891 ,
      "overlandpark": 5378 ,
      "page": 5420 ,
      "paint": 5408 ,
      "pale": 5969 ,
      "palm": 8925 ,
      "panera": 14452 ,
      "part": 61366 ,
      "pasadena": 6010 ,
      "pass": 6419 ,
      "penn": 9406 ,
      "per": 9915 ,
      "person": 14300 ,
      "pharmacist": 5496 ,
      "philadelphia": 30205 ,
      "phoenix": 34840 ,
      "phone": 6615 ,
      "photo": 218645 ,
      "pic": 13575 ,
      "pier": 7874 ,
      "pink": 7501 ,
      "pizza": 17653 ,
      "plano": 6038 ,
      "play": 20936 ,
      "plaza": 14053 ,
      "plus": 6375 ,
      "point": 25246 ,
      "pokemongo": 5917 ,
      "pool": 22526 ,
      "pop": 8016 ,
      "post": 25364 ,
      "power": 13191 ,
      "prn": 15198 ,
      "process": 6285 ,
      "product": 10772 ,
      "productmgmt": 6397 ,
      "program": 15288 ,
      "proud": 21065 ,
      "pub": 9484 ,
      "queen": 8496 ,
      "quick": 9684 ,
      "race": 7576 ,
      "realtor": 6953 ,
      "recommend": 601669 ,
      "record": 5510 ,
      "regionsbank": 11482 ,
      "regrann": 5911 ,
      "rehab": 5745 ,
      "rep": 7635 ,
      "report": 14263 ,
      "repostapp": 9919 ,
      "research": 8032 ,
      "retail": 264943 ,
      "richmond": 22808 ,
      "rico": 12392 ,
      "rise": 5353 ,
      "river": 29007 ,
      "robert": 14499 ,
      "rock": 27364 ,
      "room": 27578 ,
      "round": 10905 ,
      "row": 5172 ,
      "said": 14787 ,
      "sale": 13203 ,
      "salem": 6819 ,
      "salesperson": 11808 ,
      "salt": 5761 ,
      "sam": 5084 ,
      "sanantonio": 18495 ,
      "sandiego": 23314 ,
      "santa": 17591 ,
      "sarasota": 5483 ,
      "sat": 17564 ,
      "savannah": 7125 ,
      "season": 19127 ,
      "second": 11818 ,
      "see": 683255 ,
      "seen": 11892 ,
      "send": 5006 ,
      "session": 11976 ,
      "set": 22449 ,
      "share": 12414 ,
      "shift": 69499 ,
      "shirt": 7896 ,
      "shoot": 9987 ,
      "shot": 15514 ,
      "shoulder": 10685 ,
      "show": 59526 ,
      "sidewalk": 13559 ,
      "simon": 6820 ,
      "six": 5050 ,
      "size": 9157 ,
      "slow": 8225 ,
      "smile": 9845 ,
      "snapchat": 5049 ,
      "sold": 5174 ,
      "sonic": 73635 ,
      "soon": 19364 ,
      "soul": 8539 ,
      "sound": 6767 ,
      "southern": 8232 ,
      "special": 29564 ,
      "specialist": 42725 ,
      "spectrum": 12095 ,
      "speech": 7025 ,
      "spend": 7961 ,
      "spirit": 5111 ,
      "spring": 34152 ,
      "squad": 5587 ,
      "sse": 6148 ,
      "state": 56693 ,
      "station": 41726 ,
      "stay": 15984 ,
      "step": 5952 ,
      "still": 43666 ,
      "stone": 7004 ,
      "stop": 61878 ,
      "store": 120979 ,
      "storm": 32668 ,
      "straight": 5127 ,
      "strong": 9395 ,
      "student": 8474 ,
      "studio": 18402 ,
      "stuff": 8355 ,
      "style": 16089 ,
      "success": 8822 ,
      "sugar": 5518 ,
      "summit": 6419 ,
      "sun": 36147 ,
      "super": 23226 ,
      "sure": 21342 ,
      "sushi": 7550 ,
      "sweet": 23393 ,
      "taken": 5883 ,
      "talk": 10688 ,
      "tampa": 20347 ,
      "target": 8922 ,
      "taylor": 5578 ,
      "tech": 19901 ,
      "technologist": 7966 ,
      "tell": 14993 ,
      "teller": 9432 ,
      "test": 20969 ,
      "thank": 57697 ,
      "thing": 20478 ,
      "think": 31140 ,
      "tho": 5461 ,
      "thought": 10874 ,
      "throwback": 7207 ,
      "thu": 12198 ,
      "thunderstorm": 13570 ,
      "till": 8255 ,
      "today": 291242 ,
      "tomorrow": 35267 ,
      "tonight": 184181 ,
      "took": 18350 ,
      "top": 22634 ,
      "tour": 21243 ,
      "tower": 5904 ,
      "town": 23887 ,
      "track": 7293 ,
      "trash": 5449 ,
      "travel": 30026 ,
      "trndnl": 30119 ,
      "truck": 15786 ,
      "trump": 17995 ,
      "tucson": 11280 ,
      "tue": 12173 ,
      "turn": 8873 ,
      "union": 13388 ,
      "upper": 6916 ,
      "use": 12127 ,
      "utah": 6333 ,
      "valley": 23883 ,
      "van": 6436 ,
      "via": 32891 ,
      "view": 329458 ,
      "virtual": 8202 ,
      "wake": 5460 ,
      "walk": 19964 ,
      "walt": 5182 ,
      "wanna": 9815 ,
      "warm": 6984 ,
      "watch": 21164 ,
      "way": 54591 ,
      "wear": 6087 ,
      "weather": 85374 ,
      "web": 6986 ,
      "week": 58424 ,
      "weekend": 64154 ,
      "well": 27882 ,
      "west": 61485 ,
      "westfield": 5941 ,
      "white": 27560 ,
      "wichita": 5572 ,
      "wild": 13840 ,
      "wilmington": 7314 ,
      "wine": 16170 ,
      "wisconsin": 6915 ,
      "wish": 10322 ,
      "wit": 5650 ,
      "without": 12371 ,
      "wonder": 5952 ,
      "wood": 5018 ,
      "word": 7156 ,
      "work": 961162 ,
      "wrong": 5076 ,
      "yard": 8019 ,
      "year": 45224 ,
      "yes": 18032 ,
      "yesterday": 24547 ,
      "yoga": 9656 ,
      "york": 104065 ,
      "young": 13218 ,
      "youth": 5246 ,
      "account": 13478 ,
      "across": 8671 ,
      "action": 8261 ,
      "add": 5394 ,
      "advisor": 15409 ,
      "ain": 9563 ,
      "airport": 41004 ,
      "aka": 5426 ,
      "alabama": 9489 ,
      "alaska": 5605 ,
      "ale": 18756 ,
      "allen": 7249 ,
      "almost": 15874 ,
      "along": 8154 ,
      "america": 16552 ,
      "anaheim": 6995 ,
      "analyst": 33209 ,
      "apr": 12215 ,
      "april": 11426 ,
      "architect": 5687 ,
      "arlington": 20070 ,
      "artist": 13780 ,
      "ask": 8247 ,
      "ass": 9589 ,
      "atl": 6560 ,
      "atlanta": 52464 ,
      "auburn": 7041 ,
      "aug": 14043 ,
      "august": 8280 ,
      "auto": 29973 ,
      "ave": 73213 ,
      "back": 126512 ,
      "bad": 18558 ,
      "bag": 5282 ,
      "baker": 15920 ,
      "band": 9562 ,
      "bank": 19289 ,
      "banker": 7742 ,
      "bar": 55191 ,
      "barista": 23493 ,
      "barrel": 5449 ,
      "basket": 9524 ,
      "bbq": 10055 ,
      "bear": 6543 ,
      "beat": 7676 ,
      "bed": 7595 ,
      "beer": 33064 ,
      "begin": 5401 ,
      "behind": 9255 ,
      "big": 47296 ,
      "bike": 7622 ,
      "bill": 5618 ,
      "bird": 5326 ,
      "birthday": 59743 ,
      "bit": 10189 ,
      "blender": 10199 ,
      "block": 26793 ,
      "bloomington": 6114 ,
      "blue": 21390 ,
      "blvd": 28457 ,
      "boat": 5354 ,
      "bonus": 10159 ,
      "booth": 5431 ,
      "boston": 48333 ,
      "boulevard": 10649 ,
      "boy": 17359 ,
      "branch": 8322 ,
      "brand": 8745 ,
      "breakfast": 19791 ,
      "bring": 12090 ,
      "broken": 24094 ,
      "brother": 11193 ,
      "brought": 6933 ,
      "buffalo": 13264 ,
      "burger": 8725 ,
      "bus": 8422 ,
      "businessmgmt": 66931 ,
      "buy": 8110 ,
      "california": 96925 ,
      "call": 26926 ,
      "cam": 5889 ,
      "came": 19183 ,
      "canada": 5393 ,
      "canyon": 8123 ,
      "care": 66388 ,
      "career": 56811 ,
      "carhop": 7396 ,
      "carpool": 6943 ,
      "casa": 7406 ,
      "case": 29060 ,
      "cashier": 29447 ,
      "casino": 9058 ,
      "caught": 5321 ,
      "cdl": 43813 ,
      "cdt": 11526 ,
      "chandler": 7122 ,
      "channel": 5328 ,
      "charter": 5264 ,
      "check": 344826 ,
      "chef": 10380 ,
      "chicago": 81361 ,
      "children": 8648 ,
      "class": 52400 ,
      "clean": 7737 ,
      "click": 885386 ,
      "client": 10001 ,
      "cloud": 6016 ,
      "coach": 8153 ,
      "coast": 7477 ,
      "cold": 15634 ,
      "come": 81271 ,
      "con": 20043 ,
      "concord": 6386 ,
      "contratar": 17767 ,
      "corner": 7280 ,
      "couldn": 9858 ,
      "counter": 15871 ,
      "cover": 7265 ,
      "crash": 5677 ,
      "cream": 12455 ,
      "credit": 7281 ,
      "cttraffic": 6426 ,
      "cvs": 32461 ,
      "data": 11577 ,
      "date": 14097 ,
      "dave": 5142 ,
      "dayton": 7898 ,
      "dead": 6413 ,
      "del": 12685 ,
      "delay": 32289 ,
      "delta": 5223 ,
      "denver": 33106 ,
      "desert": 5234 ,
      "dew": 5936 ,
      "dinner": 34449 ,
      "disney": 20909 ,
      "district": 21932 ,
      "doesn": 11806 ,
      "dog": 18492 ,
      "downtown": 32020 ,
      "dream": 9934 ,
      "dress": 8555 ,
      "drop": 19598 ,
      "due": 12179 ,
      "earth": 8048 ,
      "east": 42263 ,
      "easter": 12968 ,
      "end": 24937 ,
      "endomondo": 5469 ,
      "enjoy": 16230 ,
      "enough": 14418 ,
      "epic": 6254 ,
      "ese": 5644 ,
      "event": 28519 ,
      "everyday": 6929 ,
      "exit": 87534 ,
      "expert": 5301 ,
      "face": 13738 ,
      "facilitiesmgmt": 25408 ,
      "fair": 10870 ,
      "fairfield": 6196 ,
      "fall": 9943 ,
      "far": 10891 ,
      "farmington": 5673 ,
      "fashion": 14448 ,
      "fast": 7649 ,
      "fine": 12461 ,
      "finish": 6014 ,
      "fire": 27461 ,
      "first": 89315 ,
      "flight": 8995 ,
      "florida": 57467 ,
      "flower": 5802 ,
      "fog": 11066 ,
      "follow": 16050 ,
      "food": 46423 ,
      "forecast": 95613 ,
      "forest": 9007 ,
      "forget": 9172 ,
      "fort": 20230 ,
      "francisco": 26917 ,
      "franklin": 11565 ,
      "french": 5383 ,
      "fresh": 16865 ,
      "fresno": 6928 ,
      "fri": 14811 ,
      "gave": 5588 ,
      "general": 32286 ,
      "girl": 29331 ,
      "glass": 5918 ,
      "gold": 10246 ,
      "golf": 15137 ,
      "gonna": 15627 ,
      "good": 122778 ,
      "gorgeous": 12199 ,
      "got": 84773 ,
      "gotta": 12571 ,
      "gov": 8879 ,
      "grand": 22839 ,
      "green": 20263 ,
      "greensboro": 7190 ,
      "grill": 21438 ,
      "group": 26227 ,
      "gst": 8922 ,
      "guess": 10789 ,
      "gust": 13424 ,
      "half": 22252 ,
      "hall": 16193 ,
      "hand": 8334 ,
      "handler": 6733 ,
      "hard": 23184 ,
      "harlem": 5131 ,
      "hartford": 10322 ,
      "hawaii": 14140 ,
      "head": 17919 ,
      "health": 98938 ,
      "heat": 6903 ,
      "heaven": 5564 ,
      "hell": 7901 ,
      "help": 21410 ,
      "henderson": 6243 ,
      "hike": 7121 ,
      "hiphop": 5817 ,
      "hit": 15899 ,
      "holiday": 6390 ,
      "hollywood": 26009 ,
      "home": 92505 ,
      "hook": 14680 ,
      "hop": 7946 ,
      "hope": 22028 ,
      "hotel": 23690 ,
      "hour": 18669 ,
      "houston": 87220 ,
      "hudson": 6045 ,
      "huntington": 5454 ,
      "icu": 8245 ,
      "iii": 8904 ,
      "inch": 13123 ,
      "inn": 9293 ,
      "instagood": 5450 ,
      "instructor": 7602 ,
      "intern": 6373 ,
      "internship": 11643 ,
      "ipa": 24603 ,
      "isn": 8391 ,
      "jackson": 13965 ,
      "jefferson": 5924 ,
      "jersey": 26147 ,
      "jesus": 6850 ,
      "job": 3141305 ,
      "joe": 7475 ,
      "john": 15129 ,
      "jordan": 5359 ,
      "jose": 7011 ,
      "journey": 5493 ,
      "juan": 12519 ,
      "june": 10506 ,
      "keep": 19536 ,
      "kick": 6183 ,
      "kid": 8170 ,
      "kind": 9661 ,
      "kitchen": 18239 ,
      "lab": 8485 ,
      "lake": 52641 ,
      "lakewood": 6337 ,
      "last": 93210 ,
      "late": 14831 ,
      "latest": 1186988 ,
      "lead": 22070 ,
      "learn": 9187 ,
      "left": 29395 ,
      "legal": 17662 ,
      "less": 7239 ,
      "lexington": 11388 ,
      "life": 76046 ,
      "light": 39329 ,
      "like": 108688 ,
      "link": 18866 ,
      "lit": 10491 ,
      "live": 48980 ,
      "loan": 5561 ,
      "long": 39929 ,
      "look": 46893 ,
      "lord": 6240 ,
      "lost": 10108 ,
      "low": 7342 ,
      "luck": 5242 ,
      "lunch": 30195 ,
      "made": 42824 ,
      "madison": 15071 ,
      "major": 7282 ,
      "mall": 10682 ,
      "manhattan": 21482 ,
      "maryland": 13807 ,
      "matter": 6326 ,
      "may": 41512 ,
      "mean": 7272 ,
      "med": 16661 ,
      "media": 14416 ,
      "member": 41892 ,
      "men": 11322 ,
      "met": 9491 ,
      "michael": 5205 ,
      "michigan": 16002 ,
      "mid": 6690 ,
      "mike": 5946 ,
      "mill": 5974 ,
      "mind": 10516 ,
      "mini": 6111 ,
      "miss": 25650 ,
      "mission": 9835 ,
      "missouri": 7448 ,
      "mist": 14187 ,
      "mom": 18636 ,
      "moment": 11968 ,
      "monday": 30617 ,
      "money": 10306 ,
      "monica": 6397 ,
      "month": 13517 ,
      "most": 28294 ,
      "mountain": 18846 ,
      "much": 48812 ,
      "must": 11724 ,
      "name": 10008 ,
      "near": 30892 ,
      "nevada": 9269 ,
      "never": 37856 ,
      "newark": 11004 ,
      "newest": 9041 ,
      "nice": 26981 ,
      "night": 129286 ,
      "nissan": 6257 ,
      "norfolk": 7169 ,
      "nsunset": 14562 ,
      "nthe": 9210 ,
      "nyc": 45749 ,
      "oak": 9390 ,
      "oakland": 16377 ,
      "oil": 5174 ,
      "omg": 5982 ,
      "open": 30331 ,
      "oregon": 10871 ,
      "orlando": 43306 ,
      "owner": 25410 ,
      "palmillabeach": 6472 ,
      "paloalto": 6438 ,
      "para": 10866 ,
      "park": 134771 ,
      "parkway": 11667 ,
      "partner": 5254 ,
      "past": 10936 ,
      "pathologist": 5134 ,
      "patient": 12046 ,
      "paul": 7248 ,
      "pay": 5506 ,
      "pennsylvania": 17140 ,
      "perfect": 23633 ,
      "pet": 6825 ,
      "physician": 38286 ,
      "pick": 9319 ,
      "pittsburgh": 17331 ,
      "place": 55745 ,
      "plan": 5866 ,
      "planet": 5935 ,
      "plant": 5648 ,
      "por": 9441 ,
      "port": 8978 ,
      "portland": 57927 ,
      "pre": 10500 ,
      "prep": 7338 ,
      "press": 5267 ,
      "pride": 5992 ,
      "pro": 9148 ,
      "progress": 5089 ,
      "project": 21227 ,
      "projectmgmt": 10956 ,
      "public": 15184 ,
      "puerto": 12230 ,
      "pull": 5783 ,
      "put": 15633 ,
      "quarter": 5872 ,
      "que": 21850 ,
      "radio": 9949 ,
      "rain": 104173 ,
      "raleigh": 13766 ,
      "ramp": 10750 ,
      "ranch": 7218 ,
      "read": 297189 ,
      "real": 28731 ,
      "realdonaldtrump": 5352 ,
      "reason": 5073 ,
      "red": 28850 ,
      "reno": 6223 ,
      "repost": 42939 ,
      "request": 35854 ,
      "resort": 18786 ,
      "rest": 10612 ,
      "ride": 15752 ,
      "right": 62584 ,
      "road": 45817 ,
      "roll": 7328 ,
      "rose": 8823 ,
      "rte": 14708 ,
      "run": 24807 ,
      "sacramento": 13148 ,
      "safe": 8988 ,
      "saint": 15048 ,
      "salad": 6000 ,
      "salon": 16042 ,
      "san": 90650 ,
      "sanfrancisco": 25032 ,
      "sanjuan": 8170 ,
      "saturday": 49476 ,
      "save": 6066 ,
      "saw": 12320 ,
      "say": 29666 ,
      "school": 58870 ,
      "sea": 9921 ,
      "seafood": 5285 ,
      "self": 6724 ,
      "senior": 43972 ,
      "serious": 5546 ,
      "server": 22987 ,
      "seven": 5447 ,
      "shit": 13567 ,
      "shop": 24202 ,
      "short": 8802 ,
      "shout": 7393 ,
      "side": 23348 ,
      "sign": 18712 ,
      "silver": 7202 ,
      "sister": 9404 ,
      "site": 5181 ,
      "sky": 57787 ,
      "sleep": 7423 ,
      "small": 10824 ,
      "snow": 23599 ,
      "soccer": 5436 ,
      "social": 11386 ,
      "solo": 8434 ,
      "son": 10216 ,
      "song": 10618 ,
      "south": 68825 ,
      "spa": 10037 ,
      "space": 10830 ,
      "spartanburg": 9077 ,
      "spent": 7839 ,
      "split": 5896 ,
      "spot": 11321 ,
      "springfield": 18092 ,
      "stadium": 17693 ,
      "staff": 24737 ,
      "stage": 11571 ,
      "stand": 6574 ,
      "star": 11825 ,
      "start": 29687 ,
      "steak": 5614 ,
      "stem": 6535 ,
      "stock": 5780 ,
      "stout": 7489 ,
      "street": 84506 ,
      "stylist": 21102 ,
      "summer": 50701 ,
      "sunday": 50086 ,
      "sundayfunday": 7353 ,
      "sunset": 43301 ,
      "supervisor": 65394 ,
      "supplychain": 26283 ,
      "support": 37462 ,
      "syn": 7315 ,
      "system": 11979 ,
      "taco": 7642 ,
      "tacoma": 8836 ,
      "take": 44197 ,
      "tap": 11914 ,
      "tattoo": 9204 ,
      "tavern": 7119 ,
      "tax": 6583 ,
      "tbt": 21736 ,
      "tcp": 7456 ,
      "tea": 8018 ,
      "teacher": 11897 ,
      "team": 387999 ,
      "technician": 64862 ,
      "temp": 27357 ,
      "theater": 7171 ,
      "therapist": 19699 ,
      "third": 5120 ,
      "though": 8961 ,
      "three": 13382 ,
      "thru": 5509 ,
      "thursday": 25399 ,
      "til": 5104 ,
      "time": 225502 ,
      "told": 7030 ,
      "topic": 8792 ,
      "touch": 5254 ,
      "trabajo": 25123 ,
      "traffic": 93534 ,
      "trail": 9587 ,
      "train": 8286 ,
      "treat": 5558 ,
      "tree": 9450 ,
      "trend": 8577 ,
      "trip": 19197 ,
      "troy": 6465 ,
      "trucker": 7465 ,
      "true": 11463 ,
      "truth": 6710 ,
      "tstm": 5461 ,
      "tuesday": 22422 ,
      "tulsa": 10434 ,
      "twitter": 5062 ,
      "two": 46710 ,
      "ulta": 9767 ,
      "una": 7375 ,
      "unit": 10207 ,
      "usa": 29407 ,
      "utc": 12367 ,
      "vegan": 6010 ,
      "video": 42656 ,
      "virginia": 18715 ,
      "visit": 16270 ,
      "vista": 9596 ,
      "wait": 25206 ,
      "wall": 8229 ,
      "walmart": 5926 ,
      "want": 627075 ,
      "washington": 62083 ,
      "wasn": 5395 ,
      "water": 19531 ,
      "webdesign": 7333 ,
      "wed": 13812 ,
      "wednesday": 21905 ,
      "went": 16235 ,
      "whole": 11946 ,
      "wife": 6714 ,
      "williamsburg": 5946 ,
      "win": 16088 ,
      "wind": 136330 ,
      "winter": 9448 ,
      "wireless": 5262 ,
      "wnd": 7748 ,
      "woman": 11030 ,
      "women": 15733 ,
      "won": 12850 ,
      "worker": 8958 ,
      "workout": 16018 ,
      "world": 45532 ,
      "worth": 14285 ,
      "would": 31090 ,
      "wow": 10243 ,
      "yeah": 9063 ,
      "yet": 11646 ,
      "yum": 6201 ,
      "zoo": 7527
    };

  })
  .directive("map", function () {
    return {
      restrict: 'E',
      scope: {
        lat: "=",
        lng: "=",
        zoom: "="
      },
      controller: 'MapCtrl',
      template:[
        '<leaflet lf-center="center" tiles="tiles" events="events" controls="controls" width="100%" height="100%" ng-init="init()"></leaflet><div ng-controller="countMapCtrl"></div><div ng-controller="pinMapCtrl"></div><div ng-controller="heatMapCtrl"></div>'
      ].join('')
    };
  });
