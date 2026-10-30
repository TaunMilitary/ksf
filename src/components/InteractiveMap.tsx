import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import {
  CASE_TYPE_VISUALS,
  FATSA_COURTHOUSE,
  getCaseTypeVisualMeta,
} from "../data/fatsaData";
import { InspectionRecord, ParcelItem } from "../types";
import {
  calculatePolygonAreaM2,
  formatAdaParselLabel,
  formatAreaM2,
  formatDateTR,
  formatVehicleLabel,
} from "../services/geoService";

interface InteractiveMapProps {
  mode: "picker" | "overview";
  selectedLat?: number;
  selectedLng?: number;
  selectedLabel?: string;
  selectedCaseType?: string;
  selectedParcelPolygon?: [number, number][];
  selectedParcelMeta?: {
    adaNo?: string;
    parselNo?: string;
    nitelik?: string;
    yuzolcumuM2?: number;
    paftaNo?: string;
  };
  selectedParcels?: ParcelItem[];
  focusParcelZoomTrigger?: number;
  pickerRouteGeometry?: [number, number][];
  inspections?: InspectionRecord[];
  filterDate?: string | null;
  focusedInspectionId?: string | null;
  dailyRouteGeometry?: [number, number][];
  onSelectPoint?: (lat: number, lng: number) => void;
  onSelectInspection?: (record: InspectionRecord) => void;
  heightClass?: string;
}

type TileLayerStyle = "topo_street" | "satellite_hybrid" | "street_classic";

// API anahtarı (API Key) ve Referer başlığı GEREKTİRMEYEN, hem tarayıcıda hem de yerel klasörden (file://) %100 kesintisiz çalışan harita sunucuları
const TILE_LAYERS: Record<
  TileLayerStyle,
  {
    url: string;
    overlayUrls?: string[];
    attribution: string;
    maxZoom: number;
  }
> = {
  topo_street: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution:
      "Harita: &copy; Esri, HERE, Garmin, OpenStreetMap katkıcıları ve CBS Topluluğu",
    maxZoom: 19,
  },
  satellite_hybrid: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    overlayUrls: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution:
      "Uydu & Kadastro Katmanı: &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  street_classic: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Sokak Haritası: &copy; Esri, HERE, Garmin, USGS",
    maxZoom: 19,
  },
};

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  mode,
  selectedLat,
  selectedLng,
  selectedLabel,
  selectedCaseType,
  selectedParcelPolygon,
  selectedParcelMeta,
  selectedParcels = [],
  focusParcelZoomTrigger = 0,
  pickerRouteGeometry,
  inspections = [],
  filterDate,
  focusedInspectionId,
  dailyRouteGeometry = [],
  onSelectPoint,
  onSelectInspection,
  heightClass = "h-[420px]",
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const baseTileGroupRef = useRef<L.LayerGroup | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const [tileStyle, setTileStyle] = useState<TileLayerStyle>("topo_street");

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [FATSA_COURTHOUSE.lat, FATSA_COURTHOUSE.lng],
      zoom: 12,
      zoomControl: true,
    });

    const baseTileGroup = L.layerGroup().addTo(map);
    const layerGroup = L.layerGroup().addTo(map);

    const initialLayerCfg = TILE_LAYERS.topo_street;
    L.tileLayer(initialLayerCfg.url, {
      attribution: initialLayerCfg.attribution,
      maxZoom: initialLayerCfg.maxZoom,
    }).addTo(baseTileGroup);

    mapInstanceRef.current = map;
    baseTileGroupRef.current = baseTileGroup;
    layerGroupRef.current = layerGroup;

    // Fix resize rendering inside tabs
    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      baseTileGroupRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Switch between Topographic Street Map, Hybrid Satellite (with Roads/Villages), and Classic Street Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    const baseTileGroup = baseTileGroupRef.current;
    if (!map || !baseTileGroup) return;

    baseTileGroup.clearLayers();

    const cfg = TILE_LAYERS[tileStyle];
    L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(baseTileGroup);

    if (cfg.overlayUrls) {
      cfg.overlayUrls.forEach((oUrl) => {
        L.tileLayer(oUrl, {
          maxZoom: cfg.maxZoom,
          pane: "overlayPane",
        }).addTo(baseTileGroup);
      });
    }
  }, [tileStyle]);

  // Attach map click handler for picker mode
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (mode === "picker" && onSelectPoint) {
        onSelectPoint(
          Number(e.latlng.lat.toFixed(6)),
          Number(e.latlng.lng.toFixed(6))
        );
      }
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [mode, onSelectPoint]);

  // Helper to render the active queried/selected parcel boundary polygon (and any multi-parcels in selectedParcels)
  const renderSelectedParcelBoundary = (
    layerGroup: L.LayerGroup
  ): { bounds: L.LatLngBounds | null; marker: L.Marker | null } => {
    let parcelBounds: L.LatLngBounds | null = null;
    let targetMarker: L.Marker | null = null;

    // Render all parcels in selectedParcels (1st, 2nd, 3rd... parcel)
    if (selectedParcels && selectedParcels.length > 0) {
      selectedParcels.forEach((p, idx) => {
        const strokeColor = idx === 0 ? "#ea580c" : "#0284c7";
        const fillColor = idx === 0 ? "#f59e0b" : "#38bdf8";

        if (p.polygon && p.polygon.length >= 3) {
          const pPoly = L.polygon(p.polygon, {
            color: strokeColor,
            weight: 3,
            opacity: 0.95,
            fillColor,
            fillOpacity: 0.34,
          }).addTo(layerGroup);

          if (!parcelBounds) {
            parcelBounds = pPoly.getBounds();
          } else {
            parcelBounds.extend(pPoly.getBounds());
          }

          pPoly.bindPopup(`
            <div style="min-width:205px;">
              <div style="font-size:10px;font-weight:700;color:${strokeColor};">DOSYADAKİ ${idx + 1}. PARSEL</div>
              <div style="font-size:14px;font-weight:800;color:#0f172a;margin-top:2px;">📐 ${p.adaNo} Ada / ${p.parselNo} Parsel</div>
              ${p.neighborhood ? `<div style="font-size:12px;color:#334155;">${p.neighborhood}</div>` : ""}
              ${p.nitelik ? `<div style="font-size:11px;color:#475569;margin-top:2px;">Nitelik: <strong>${p.nitelik}</strong></div>` : ""}
              ${p.yuzolcumuM2 ? `<div style="font-size:12px;color:#059669;font-family:monospace;font-weight:700;margin-top:2px;">Yüzölçümü: ${formatAreaM2(p.yuzolcumuM2)} m²</div>` : ""}
            </div>
          `);
        }

        // Birden fazla parsel varsa her parselin merkezine numaralı parsel etiketi koy
        if (selectedParcels.length > 1 && p.centerLat && p.centerLng) {
          const badgeIcon = L.divIcon({
            className: "custom-div-icon",
            html: `
              <div style="background:${strokeColor};color:#ffffff;font-size:10px;font-weight:800;font-family:monospace;padding:2px 6px;border-radius:5px;border:1.5px solid #ffffff;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;">
                #${idx + 1}: ${p.adaNo}/${p.parselNo}
              </div>
            `,
            iconSize: [90, 22],
            iconAnchor: [45, 11],
          });
          L.marker([p.centerLat, p.centerLng], {
            icon: badgeIcon,
            zIndexOffset: 910 + idx,
          }).addTo(layerGroup);
        }
      });
    } else if (selectedParcelPolygon && selectedParcelPolygon.length >= 3) {
      const adaParselBadge =
        selectedParcelMeta?.adaNo || selectedParcelMeta?.parselNo
          ? `${selectedParcelMeta.adaNo || "0"} Ada / ${
              selectedParcelMeta.parselNo || ""
            } Parsel`
          : "Seçili Taşınmaz Sınırı";
      const areaVal =
        selectedParcelMeta?.yuzolcumuM2 ||
        calculatePolygonAreaM2(selectedParcelPolygon);

      const parcelPoly = L.polygon(selectedParcelPolygon, {
        color: "#ea580c",
        weight: 3.5,
        opacity: 1,
        fillColor: "#f59e0b",
        fillOpacity: 0.36,
      }).addTo(layerGroup);

      const polyBounds = parcelPoly.getBounds();
      if (!parcelBounds) {
        parcelBounds = polyBounds;
      } else {
        (parcelBounds as L.LatLngBounds).extend(polyBounds);
      }

      parcelPoly.bindPopup(`
        <div style="min-width:215px;">
          <div style="font-size:10px;font-weight:700;color:#b45309;letter-spacing:0.04em;">TKGM KADASTRO TAŞINMAZ SINIRI</div>
          <div style="font-size:14px;font-weight:800;color:#0f172a;margin-top:2px;">📐 ${adaParselBadge}</div>
          ${
            selectedLabel
              ? `<div style="font-size:12px;font-weight:600;color:#1e293b;margin-top:2px;">${selectedLabel}</div>`
              : ""
          }
          ${
            selectedParcelMeta?.nitelik
              ? `<div style="font-size:12px;color:#334155;margin-top:2px;">Nitelik: <strong>${selectedParcelMeta.nitelik}</strong></div>`
              : ""
          }
          ${
            areaVal > 0
              ? `<div style="font-size:12px;color:#059669;font-family:monospace;font-weight:700;margin-top:2px;">Yüzölçümü: ${formatAreaM2(areaVal)} m²</div>`
              : ""
          }
          ${
            selectedParcelMeta?.paftaNo
              ? `<div style="font-size:11px;color:#64748b;font-family:monospace;margin-top:2px;">Pafta: ${selectedParcelMeta.paftaNo}</div>`
              : ""
          }
        </div>
      `);
    }

    if (selectedLat && selectedLng) {
      const hasAdaParsel = Boolean(
        selectedParcelMeta?.adaNo || selectedParcelMeta?.parselNo
      );
      const adaParselShort =
        selectedParcels && selectedParcels.length > 1
          ? `${selectedParcels.length} Parsel (${selectedParcels[0].adaNo}/${selectedParcels[0].parselNo}+)`
          : hasAdaParsel
          ? `${selectedParcelMeta?.adaNo || "0"}/${
              selectedParcelMeta?.parselNo || "1"
            }`
          : null;
      const caseVisual = getCaseTypeVisualMeta(selectedCaseType);

      const selectedIcon = L.divIcon({
        className: "custom-div-icon",
        html: adaParselShort
          ? `
            <div style="display:flex;flex-direction:column;align-items:center;">
              <div style="background:${caseVisual.bgColor};color:#ffffff;font-size:10px;font-weight:800;font-family:monospace;padding:2px 6px;border-radius:5px;border:1.5px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.3);white-space:nowrap;margin-bottom:2px;">
                ${caseVisual.icon} ${adaParselShort}
              </div>
              <div style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;background:${caseVisual.bgColor};color:#ffffff;border:2.5px solid #ffffff;box-shadow:0 6px 16px rgba(15,23,42,0.4);font-weight:700;font-size:15px;">
                ${caseVisual.icon}
              </div>
            </div>
          `
          : `
            <div style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;background:${caseVisual.bgColor};color:#ffffff;border:3px solid #ffffff;box-shadow:0 6px 16px rgba(15,23,42,0.4);font-weight:700;font-size:15px;">
              ${caseVisual.icon}
            </div>
          `,
        iconSize: adaParselShort ? [135, 56] : [36, 36],
        iconAnchor: adaParselShort ? [67, 40] : [18, 18],
        popupAnchor: [0, -22],
      });

      targetMarker = L.marker([selectedLat, selectedLng], {
        icon: selectedIcon,
        zIndexOffset: 920,
      });

      targetMarker.bindPopup(`
        <div style="min-width:205px;">
          <div style="font-size:11px;font-weight:700;color:${caseVisual.bgColor};">${caseVisual.icon} ${caseVisual.caseType.toLocaleUpperCase("tr-TR")}</div>
          <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">${
            selectedLabel || "Seçilen Nokta"
          }</div>
          ${
            hasAdaParsel
              ? `<div style="margin-top:4px;padding:4px 6px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;font-size:11px;color:#92400e;">
                  <strong>📐 ${selectedParcelMeta?.adaNo || "0"} Ada / ${
                  selectedParcelMeta?.parselNo || "1"
                } Parsel</strong>
                  ${
                    selectedParcelMeta?.nitelik
                      ? `<br/>Nitelik: ${selectedParcelMeta.nitelik}`
                      : ""
                  }
                  ${
                    selectedParcelMeta?.yuzolcumuM2
                      ? `<br/>Yüzölçümü: ${formatAreaM2(
                          selectedParcelMeta.yuzolcumuM2
                        )} m²`
                      : ""
                  }
                  ${
                    selectedParcelMeta?.paftaNo
                      ? `<br/>Pafta: ${selectedParcelMeta.paftaNo}`
                      : ""
                  }
                </div>`
              : ""
          }
          <div style="font-size:11px;font-family:monospace;color:#64748b;margin-top:4px;">${selectedLat.toFixed(
            5
          )}, ${selectedLng.toFixed(5)}</div>
        </div>
      `);
      targetMarker.addTo(layerGroup);
    }

    return { bounds: parcelBounds, marker: targetMarker };
  };

  // Render markers, parcel boundary polygons, and polylines whenever props change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // 1. Always render Fatsa Adliyesi (Center Anchor Marker)
    const courthouseIcon = L.divIcon({
      className: "custom-div-icon",
      html: `
        <div style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;background:#1e293b;color:#ffffff;border:2.5px solid #ffffff;box-shadow:0 6px 16px rgba(15,23,42,0.35);font-weight:700;font-size:15px;">
          🏛️
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
      popupAnchor: [0, -18],
    });

    const courthouseMarker = L.marker(
      [FATSA_COURTHOUSE.lat, FATSA_COURTHOUSE.lng],
      { icon: courthouseIcon, zIndexOffset: 1000 }
    );

    courthouseMarker.bindPopup(`
      <div style="min-width:190px;">
        <div style="font-size:11px;font-weight:600;color:#10b981;margin-bottom:2px;">BAŞLANGIÇ / VARIŞ MERKEZ NOKTASI</div>
        <div style="font-size:13px;font-weight:700;color:#0f172a;">🏛️ ${FATSA_COURTHOUSE.name}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${FATSA_COURTHOUSE.address}</div>
        <div style="font-size:11px;font-family:monospace;color:#475569;margin-top:4px;">${FATSA_COURTHOUSE.lat}, ${FATSA_COURTHOUSE.lng}</div>
      </div>
    `);
    courthouseMarker.addTo(layerGroup);

    if (mode === "picker") {
      // Also render existing inspections with their dynamic case-type icon & color so the user sees nearby planned locations on the map
      inspections.forEach((rec) => {
        const adaParselText = formatAdaParselLabel(rec);
        const vehicleText = formatVehicleLabel(rec);
        const cMeta = getCaseTypeVisualMeta(rec.caseType);
        const existingIcon = L.divIcon({
          className: "custom-div-icon",
          html: `
            <div title="[${rec.district || "Fatsa"}] ${rec.neighborhood} - ${rec.caseType} (${formatDateTR(rec.date)})" style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${cMeta.bgColor};color:#ffffff;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(15,23,42,0.3);font-size:13px;opacity:0.9;">
              ${rec.subjectType === "arac" ? "🚗" : cMeta.icon}
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const m = L.marker([rec.lat, rec.lng], { icon: existingIcon });
        m.bindPopup(`
          <div style="min-width:195px;">
            <div style="font-size:10px;font-weight:700;color:${cMeta.bgColor};">${cMeta.icon} ${rec.caseType.toLocaleUpperCase("tr-TR")}</div>
            <div style="font-size:11px;color:#64748b;margin-top:1px;">Planlı Keşif · ${formatDateTR(rec.date)} (${rec.time})</div>
            <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:2px;">[${rec.district || "Fatsa"}] ${rec.neighborhood}</div>
            ${
              vehicleText
                ? `<div style="font-size:11px;font-weight:700;color:#4338ca;margin-top:2px;">🚗 Plaka: ${vehicleText}</div>`
                : ""
            }
            ${
              adaParselText
                ? `<div style="font-size:11px;font-weight:700;color:#b45309;margin-top:2px;">📐 ${adaParselText}${rec.yuzolcumuM2 ? ` (${formatAreaM2(rec.yuzolcumuM2)} m²)` : ""}</div>`
                : ""
            }
            <div style="font-size:12px;color:#1e293b;margin-top:2px;">Dosya: <strong>${rec.esasNo}</strong></div>
            ${rec.experts ? `<div style="font-size:11px;color:#475569;margin-top:2px;">Bilirkişi: ${rec.experts}</div>` : ""}
            ${rec.createdBy ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">Ekleyen: <strong>${rec.createdBy}</strong></div>` : ""}
          </div>
        `);
        m.addTo(layerGroup);

        if (rec.parcels && rec.parcels.length > 0) {
          rec.parcels.forEach((p) => {
            if (p.polygon && p.polygon.length >= 3) {
              L.polygon(p.polygon, {
                color: cMeta.bgColor,
                weight: 1.8,
                fillColor: cMeta.bgColor,
                fillOpacity: 0.18,
                dashArray: "3, 4",
              }).addTo(layerGroup);
            }
          });
        } else if (rec.parcelPolygon && rec.parcelPolygon.length >= 3) {
          L.polygon(rec.parcelPolygon, {
            color: cMeta.bgColor,
            weight: 1.8,
            fillColor: cMeta.bgColor,
            fillOpacity: 0.18,
            dashArray: "3, 4",
          }).addTo(layerGroup);
        }
      });

      const { bounds: parcelBounds, marker: targetMarker } =
        renderSelectedParcelBoundary(layerGroup);

      if (selectedLat && selectedLng) {
        const polyCoords: [number, number][] =
          pickerRouteGeometry && pickerRouteGeometry.length > 1
            ? pickerRouteGeometry
            : [
                [FATSA_COURTHOUSE.lat, FATSA_COURTHOUSE.lng],
                [selectedLat, selectedLng],
              ];

        const polyline = L.polyline(polyCoords, {
          color: "#10b981",
          weight: 4,
          opacity: 0.9,
          dashArray:
            pickerRouteGeometry && pickerRouteGeometry.length > 2
              ? undefined
              : "6, 8",
        }).addTo(layerGroup);

        if (focusParcelZoomTrigger > 0 && parcelBounds) {
          map.fitBounds(parcelBounds.pad(0.65), { maxZoom: 18 });
          if (targetMarker) {
            setTimeout(() => targetMarker.openPopup(), 200);
          }
        } else if (parcelBounds) {
          map.fitBounds(parcelBounds.pad(0.85), { maxZoom: 17 });
        } else {
          const bounds = polyline.getBounds().pad(0.22);
          map.fitBounds(bounds, { maxZoom: 14 });
        }
      }
    } else {
      // OVERVIEW MODE: Render all or filtered inspections + their cadastral parcel polygons + dynamic case-type icons/colors
      const sorted = [...inspections].sort((a, b) => {
        const dComp = a.date.localeCompare(b.date);
        if (dComp !== 0) return dComp;
        return a.time.localeCompare(b.time);
      });

      const boundsPoints: [number, number][] = [
        [FATSA_COURTHOUSE.lat, FATSA_COURTHOUSE.lng],
      ];

      let focusedParcelBounds: L.LatLngBounds | null = null;
      let focusedMarker: L.Marker | null = null;

      sorted.forEach((rec, index) => {
        boundsPoints.push([rec.lat, rec.lng]);
        const isFilteredDay = Boolean(filterDate);
        const isFocused = focusedInspectionId === rec.id;
        const cMeta = getCaseTypeVisualMeta(rec.caseType);
        const adaParselText = formatAdaParselLabel(rec);
        const vehicleText = formatVehicleLabel(rec);

        // Render multi-parcel boundary polygons if available
        if (rec.parcels && rec.parcels.length > 0) {
          rec.parcels.forEach((p) => {
            if (p.polygon && p.polygon.length >= 3) {
              const polyLayer = L.polygon(p.polygon, {
                color: isFocused ? "#ea580c" : cMeta.bgColor,
                weight: isFocused ? 3.5 : 2.5,
                opacity: 0.95,
                fillColor: isFocused ? "#f59e0b" : cMeta.bgColor,
                fillOpacity: isFocused ? 0.42 : 0.25,
              }).addTo(layerGroup);

              if (isFocused) {
                if (!focusedParcelBounds) {
                  focusedParcelBounds = polyLayer.getBounds();
                } else {
                  focusedParcelBounds.extend(polyLayer.getBounds());
                }
              }
            }
          });
        } else if (rec.parcelPolygon && rec.parcelPolygon.length >= 3) {
          const polyLayer = L.polygon(rec.parcelPolygon, {
            color: isFocused ? "#ea580c" : cMeta.bgColor,
            weight: isFocused ? 3.5 : 2.5,
            opacity: 0.95,
            fillColor: isFocused ? "#f59e0b" : cMeta.bgColor,
            fillOpacity: isFocused ? 0.42 : 0.25,
          }).addTo(layerGroup);

          if (isFocused) {
            focusedParcelBounds = polyLayer.getBounds();
          }
        }

        const topBadgeText =
          rec.subjectType === "arac" && rec.vehicleInfo?.plateNo
            ? `🚗 ${rec.vehicleInfo.plateNo}`
            : rec.parcels && rec.parcels.length > 1
            ? `${rec.parcels.length} Parsel (${rec.parcels[0].adaNo}/${rec.parcels[0].parselNo}+)`
            : adaParselText
            ? `${rec.adaNo || "0"}/${rec.parselNo || "1"}`
            : null;

        // Dynamic Pin Icon by Case Type (Keşif Türü) + Stop Number if day filter is active
        const pinIcon = L.divIcon({
          className: "custom-div-icon",
          html: `
            <div style="display:flex;flex-direction:column;align-items:center;position:relative;">
              ${
                topBadgeText
                  ? `<div style="background:${
                      isFocused ? "#0f172a" : cMeta.bgColor
                    };color:#ffffff;font-size:9px;font-weight:700;font-family:monospace;padding:1px 5px;border-radius:4px;border:1px solid #ffffff;white-space:nowrap;margin-bottom:2px;box-shadow:0 2px 4px rgba(0,0,0,0.25);">
                      ${topBadgeText}
                    </div>`
                  : ""
              }
              <div style="position:relative;display:flex;align-items:center;justify-content:center;width:${
                isFocused ? "38px" : "34px"
              };height:${
            isFocused ? "38px" : "34px"
          };border-radius:50%;background:${cMeta.bgColor};color:#ffffff;border:${
            isFocused ? "3px solid #fde047" : "2.5px solid #ffffff"
          };box-shadow:0 4px 12px rgba(15,23,42,0.35);font-size:15px;">
                <span>${rec.subjectType === "arac" ? "🚗" : cMeta.icon}</span>
                ${
                  isFilteredDay
                    ? `<span style="position:absolute;top:-5px;right:-6px;display:flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 3px;border-radius:999px;background:#0f172a;color:#ffffff;border:1.5px solid #ffffff;font-size:9px;font-weight:800;font-family:monospace;">
                        ${index + 1}
                      </span>`
                    : ""
                }
              </div>
            </div>
          `,
          iconSize: topBadgeText ? [104, 54] : [38, 38],
          iconAnchor: topBadgeText ? [52, 37] : [19, 19],
          popupAnchor: [0, -22],
        });

        const marker = L.marker([rec.lat, rec.lng], {
          icon: pinIcon,
          zIndexOffset: isFocused ? 980 : 500,
        });

        marker.bindPopup(`
          <div style="min-width:235px;">
            <div style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:5px;background:${cMeta.badgeBg};color:${cMeta.badgeText};font-size:10px;font-weight:800;margin-bottom:4px;">
              <span>${cMeta.icon}</span>
              <span>${rec.caseType}</span>
            </div>
            <div style="font-size:11px;font-weight:600;color:#059669;">
              ${isFilteredDay ? `${index + 1}. DURAK · ` : ""}${formatDateTR(rec.date)} · Saat ${rec.time}
            </div>
            <div style="font-size:14px;font-weight:700;color:#0f172a;margin-top:2px;">
              [${rec.district || "Fatsa"}] ${rec.neighborhood}
            </div>
            <div style="font-size:12px;color:#334155;margin-top:2px;">
              Dosya No: <strong>${rec.esasNo}</strong>
            </div>
            ${
              rec.experts
                ? `<div style="font-size:11px;color:#475569;margin-top:2px;">Bilirkişi: <strong>${rec.experts}</strong></div>`
                : ""
            }
            ${
              rec.createdBy
                ? `<div style="font-size:11px;color:#334155;margin-top:2px;">Ekleyen: <strong>${rec.createdBy}</strong></div>`
                : ""
            }
            ${
              vehicleText
                ? `<div style="margin-top:5px;padding:5px 7px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:6px;font-size:11px;color:#312e81;">
                    <div style="font-weight:800;">🚗 Araç Plaka: ${vehicleText}</div>
                    ${rec.vehicleInfo?.damageSummary ? `<div style="margin-top:1px;">Hasar/Tespit: <strong>${rec.vehicleInfo.damageSummary}</strong></div>` : ""}
                    ${rec.vehicleInfo?.inspectionPlace ? `<div style="margin-top:1px;">İnceleme Yeri: ${rec.vehicleInfo.inspectionPlace}</div>` : ""}
                  </div>`
                : ""
            }
            ${
              adaParselText
                ? `<div style="margin-top:5px;padding:5px 7px;background:#fffbeb;border:1px solid #fcd34d;border-radius:6px;font-size:11px;color:#92400e;">
                    <div style="font-weight:800;">📐 ${adaParselText}</div>
                    ${
                      rec.parcels && rec.parcels.length > 1
                        ? `<div style="margin-top:2px;font-family:monospace;font-size:10px;">${rec.parcels
                            .map((p, pIdx) => `${pIdx + 1}) ${p.adaNo}/${p.parselNo}`)
                            .join(" · ")}</div>`
                        : ""
                    }
                    ${rec.nitelik ? `<div style="margin-top:1px;">Nitelik: <strong>${rec.nitelik}</strong></div>` : ""}
                    ${rec.yuzolcumuM2 ? `<div style="font-family:monospace;margin-top:1px;">Yüzölçümü: <strong>${formatAreaM2(rec.yuzolcumuM2)} m²</strong>${rec.paftaNo ? ` · Pafta: ${rec.paftaNo}` : ""}</div>` : ""}
                  </div>`
                : ""
            }
            ${
              rec.addressDetail
                ? `<div style="font-size:11px;color:#64748b;margin-top:3px;">${rec.addressDetail}</div>`
                : ""
            }
            <div style="font-size:11px;color:#0f172a;margin-top:6px;padding-top:5px;border-top:1px solid #e2e8f0;font-family:monospace;">
              Adliye Mesafesi: <strong>${rec.distanceKm} km</strong> (~${rec.durationMin} dk)
            </div>
          </div>
        `);

        if (onSelectInspection) {
          marker.on("click", () => onSelectInspection(rec));
        }

        if (isFocused) {
          focusedMarker = marker;
        }

        marker.addTo(layerGroup);
      });

      // Also render any actively queried Ada/Parsel on Overview map if user searched from the top bar!
      let queriedParcelBounds: L.LatLngBounds | null = null;
      let queriedMarker: L.Marker | null = null;
      if (
        !focusedInspectionId &&
        selectedParcelPolygon &&
        selectedParcelPolygon.length >= 3
      ) {
        const qRender = renderSelectedParcelBoundary(layerGroup);
        queriedParcelBounds = qRender.bounds;
        queriedMarker = qRender.marker;
      }

      // If filterDate is active (or dailyRouteGeometry provided), draw polyline connecting Courthouse -> Stop 1 -> Stop 2 ...
      if (filterDate && sorted.length > 0) {
        const routeCoords: [number, number][] =
          dailyRouteGeometry && dailyRouteGeometry.length > 1
            ? dailyRouteGeometry
            : [
                [FATSA_COURTHOUSE.lat, FATSA_COURTHOUSE.lng],
                ...sorted.map((s) => [s.lat, s.lng] as [number, number]),
              ];

        L.polyline(routeCoords, {
          color: "#10b981",
          weight: 4.5,
          opacity: 0.92,
        }).addTo(layerGroup);
      }

      if (focusedParcelBounds) {
        map.fitBounds((focusedParcelBounds as L.LatLngBounds).pad(0.65), {
          maxZoom: 18,
        });
        if (focusedMarker) {
          setTimeout(() => {
            focusedMarker?.openPopup();
          }, 250);
        }
      } else if (focusedInspectionId) {
        const targetRec = sorted.find((r) => r.id === focusedInspectionId);
        if (targetRec) {
          map.setView([targetRec.lat, targetRec.lng], 17);
          if (focusedMarker) {
            setTimeout(() => {
              focusedMarker?.openPopup();
            }, 250);
          }
        }
      } else if (focusParcelZoomTrigger > 0 && queriedParcelBounds) {
        map.fitBounds(queriedParcelBounds.pad(0.65), { maxZoom: 18 });
        if (queriedMarker) {
          setTimeout(() => {
            queriedMarker?.openPopup();
          }, 250);
        }
      } else if (boundsPoints.length > 1) {
        const bounds = L.latLngBounds(boundsPoints).pad(0.2);
        map.fitBounds(bounds, { maxZoom: 13 });
      } else {
        map.setView([FATSA_COURTHOUSE.lat, FATSA_COURTHOUSE.lng], 12);
      }
    }
  }, [
    mode,
    selectedLat,
    selectedLng,
    selectedLabel,
    selectedCaseType,
    selectedParcelPolygon,
    selectedParcelMeta,
    selectedParcels,
    focusParcelZoomTrigger,
    pickerRouteGeometry,
    inspections,
    filterDate,
    focusedInspectionId,
    dailyRouteGeometry,
    onSelectInspection,
  ]);

  const handleZoomToSelectedParcel = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (selectedParcelPolygon && selectedParcelPolygon.length >= 3) {
      const b = L.latLngBounds(selectedParcelPolygon).pad(0.55);
      map.fitBounds(b, { maxZoom: 18 });
    } else if (selectedLat && selectedLng) {
      map.setView([selectedLat, selectedLng], 17);
    }
  };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 ${heightClass}`}
    >
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Top-Right Layer Switcher & Parcel Focus Button (100% Free, No API Key Required) */}
      <div className="absolute right-3 top-3 z-[400] flex flex-wrap items-center gap-1 rounded-lg border border-slate-200/90 bg-white/95 p-1 shadow-sm backdrop-blur-sm">
        {selectedParcelPolygon && selectedParcelPolygon.length >= 3 && (
          <button
            type="button"
            onClick={handleZoomToSelectedParcel}
            className="rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap"
            title="Sorgulanan Ada/Parsel Sınırına Yakınlaş"
          >
            📐 Parsele Yakınlaş
          </button>
        )}
        <button
          type="button"
          onClick={() => setTileStyle("topo_street")}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
            tileStyle === "topo_street"
              ? "bg-slate-900 text-white"
              : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          Sokak & Topo
        </button>
        <button
          type="button"
          onClick={() => setTileStyle("satellite_hybrid")}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
            tileStyle === "satellite_hybrid"
              ? "bg-slate-900 text-white"
              : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          Uydu + Kadastro
        </button>
        <button
          type="button"
          onClick={() => setTileStyle("street_classic")}
          className={`hidden sm:inline-block rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
            tileStyle === "street_classic"
              ? "bg-slate-900 text-white"
              : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          Klasik Yol
        </button>
      </div>

      {/* Bottom Dynamic Case-Type Pin Legend */}
      <div className="pointer-events-none absolute bottom-2.5 left-2.5 right-2.5 z-[400] flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border border-slate-200/90 bg-white/95 px-2.5 py-1.5 text-[10px] sm:text-[11px] text-slate-700 shadow-sm backdrop-blur-sm">
        <span className="inline-flex items-center gap-1 font-bold text-slate-900">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-slate-800 text-[10px] text-white">
            🏛️
          </span>
          Fatsa Adliyesi
        </span>
        {Object.values(CASE_TYPE_VISUALS).map((v) => (
          <span
            key={v.caseType}
            className="inline-flex items-center gap-1 font-medium text-slate-800"
          >
            <span
              style={{ backgroundColor: v.bgColor }}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white shadow-2xs"
            >
              {v.icon}
            </span>
            <span>{v.shortLabel}</span>
          </span>
        ))}
      </div>
    </div>
  );
};
