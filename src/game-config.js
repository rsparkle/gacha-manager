export const GAME_CONFIG = {
    "Genshin Impact": {
        current: {
            version: 6.4,
            version_start: "2026-02-25",
            version_duration: 42,
            characters: ['Varka', null],
            version_duration_confirmation: true,
        },
        next: {
            version: 6.5,
            future_livestream_version: 6.6,
            version_duration: 42,
            characters: ['Linnea', null],
            version_duration_confirmation: true,
        },
        maintenance_start: [22, 0], // Hour, Min
        maintenance_duration: [5, 0], // Hour, Min
        livestream_hour: [12, 0], // 05:00 in certain livestreams
        livestream_prediction: true,
        trailer_distance: 1,
        process: "GenshinImpact.exe",
        color: "#C8922A",
    },
    "Honkai: Star Rail": {
        current: {
            version: 4.0,
            version_start: "2026-02-13",
            version_duration: 40,
            characters: ['Yao Guang', 'Sparxie'],
            version_duration_confirmation: true,
        },
        next: {
            version: 4.1,
            future_livestream_version: 4.2,
            version_duration: 28,
            characters: ['Ashveil', null],
            version_duration_confirmation: true,
        },
        maintenance_start: [22,0],
        maintenance_duration: [5,0],
        livestream_hour: [11, 30],
        livestream_prediction: true,
        trailer_distance: 3,
        weekly_anchors: {
            "Currency Wars": "2026-02-16T00:00:00Z",
            "Divergent Universe": "2026-02-09T00:00:00Z"
        },
        endgame_anchors: {
            "Memory of Chaos": "2026-01-19T00:00:00Z",
            "Pure Fiction": "2026-02-16T00:00:00Z",
            "Apocalyptic Shadow": "2026-02-02T00:00:00Z"
        },
        process: "StarRail.exe",
        color: "#4A9ECD",
    },
    "Zenless Zone Zero": {
        current: {
            version: 2.6,
            version_start: "2026-02-06",
            version_duration: 46,
            characters: ['Sunna', 'Aria'],
            version_duration_confirmation: true,
        },
        next: {
            version: 2.7,
            future_livestream_version: 2.8,
            version_duration: 42,
            characters: ['Nangong Yu', 'Cissia'],
            version_duration_confirmation: false,
        },
        maintenance_start: [22,0],
        maintenance_duration: [5,0],
        livestream_hour: [11, 30],
        livestream_prediction: true,
        trailer_distance: 4,
        endgame_anchors: {
            "Shiyu Defense": "2026-02-20T00:00:00Z",
            "Deadly Assault": "2026-02-13T00:00:00Z",
            "Battle Trial": "2025-07-16T00:00:00Z",
            "Threshold Simulation": "2026-02-06T00:00:00Z"
        },
        process: "ZenlessZoneZero.exe",
        color: "#C9D400"
    },
    "Arknights Endfield": {
        current: {
            version: 1.1,
            version_start: "2026-03-12",
            version_duration: 34,
            characters: ['Tangtang', 'Rossi'],
            version_duration_confirmation: true,
        },
        next: {
            version: 1.2,
            future_livestream_version: 1.3,
            version_duration: 42,
            characters: [null, null],
            version_duration_confirmation: false,
        },
        livestream_prediction: false,
        maintenance_start: [22,0],
        maintenance_duration: [6,0],
        livestream_hour: [11, 30],
        trailer_distance: 1,
        process: "Endfield.exe",
        color: "#3ABFB0",
    },
    "Infinity Nikki": {
        current: {
            version: 2.3,
            version_start: "2026-03-03",
            version_duration: 24,
            characters: [null, null],
            version_duration_confirmation: true,
        },
        next: {
            version: 2.4,
            future_livestream_version: 2.5,
            version_duration: 28,
            characters: [null, null],
            version_duration_confirmation: false,
        },
        livestream_prediction: false,
        maintenance_start: [19, 50],
        maintenance_duration: [7, 10],
        livestream_hour: [11, 30],
        trailer_distance: 1,
        second_phase_hour: 3,
        second_phase_offset: 1,
        process: "X6Game-Win64-Shipping.exe",
        color: "#E8729A",
    }
}