<template>
    <section v-if="hostStats" class="host-stats" :class="{ compact }" aria-label="Host information">
        <div class="host-header">
            <div class="host-title">
                <span class="host-kicker">HOST / TELEMETRY</span>
                <strong>{{ hostStats.hostname || "Docker host" }}</strong>
            </div>
            <span class="host-state"><span class="host-dot"></span>ONLINE</span>
        </div>

        <div class="host-facts">
            <div v-if="hostStats.hostIP">
                <span class="label">HOST / IP</span>
                <code>{{ hostStats.hostIP }}</code>
            </div>
            <div v-if="hostStats.subnet">
                <span class="label">DOCKER SUBNET</span>
                <code>{{ hostStats.subnet }}</code>
            </div>
            <div>
                <span class="label">PLATFORM</span>
                <code>{{ hostStats.platform }}</code>
            </div>
        </div>

        <div class="host-metrics">
            <div class="host-metric">
                <div class="metric-head">
                    <span>CPU LOAD <small>{{ hostStats.cpuCount || "—" }} CORES</small></span>
                    <strong>{{ Number(hostStats.cpuLoadPercent).toFixed(1) }}%</strong>
                </div>
                <div class="metric-track"><span :style="{ width: metricWidth(hostStats.cpuLoadPercent) }"></span></div>
            </div>
            <div class="host-metric">
                <div class="metric-head">
                    <span>MEMORY <small>{{ Number(hostStats.memoryPercent).toFixed(1) }}%</small></span>
                    <strong>{{ formatBytes(hostStats.usedMemoryBytes) }} / {{ formatBytes(hostStats.totalMemoryBytes) }}</strong>
                </div>
                <div class="metric-track"><span :style="{ width: metricWidth(hostStats.memoryPercent) }"></span></div>
            </div>
            <div class="host-metric host-uptime">
                <div class="metric-head">
                    <span>UPTIME</span>
                    <strong>{{ formatUptime(hostStats.uptimeSeconds) }}</strong>
                </div>
            </div>
        </div>
    </section>
</template>

<script>
export default {
    props: {
        endpoint: {
            type: String,
            default: "",
        },
        compact: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            hostStats: null,
            refreshTimer: null,
        };
    },
    mounted() {
        this.requestHostStats();
        this.refreshTimer = window.setInterval(this.requestHostStats, 5000);
    },
    beforeUnmount() {
        window.clearInterval(this.refreshTimer);
    },
    methods: {
        requestHostStats() {
            this.$root.emitAgent(this.endpoint, "hostStats", (res) => {
                if (res?.ok) {
                    this.hostStats = res.hostStats;
                }
            });
        },

        formatBytes(bytes) {
            if (!Number.isFinite(bytes) || bytes < 0) {
                return "—";
            }
            const units = [ "B", "KiB", "MiB", "GiB", "TiB" ];
            let value = bytes;
            let unit = 0;
            while (value >= 1024 && unit < units.length - 1) {
                value /= 1024;
                unit++;
            }
            return value.toFixed(unit === 0 ? 0 : 1) + units[unit];
        },

        formatUptime(seconds) {
            if (!Number.isFinite(seconds)) {
                return "—";
            }
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            if (days > 0) {
                return days + "d " + hours + "h";
            }
            if (hours > 0) {
                return hours + "h " + minutes + "m";
            }
            return minutes + "m";
        },

        metricWidth(value) {
            const percent = Number(value);
            if (!Number.isFinite(percent)) {
                return "0%";
            }
            return Math.max(0, Math.min(percent, 100)) + "%";
        },
    },
};
</script>

<style scoped lang="scss">
.host-stats {
    flex: 0 0 auto;
    position: relative;
    overflow: hidden;
    margin-top: 10px;
    padding: 12px;
    border: 1px solid rgba(56, 189, 248, 0.28);
    border-radius: 8px;
    background:
        linear-gradient(135deg, rgba(56, 189, 248, 0.1), transparent 42%),
        linear-gradient(180deg, rgba(15, 28, 42, 0.98), rgba(9, 15, 24, 0.98));
    color: #9aa7b5;
    font-size: 0.72rem;
    line-height: 1.35;

    &::after {
        position: absolute;
        top: 0;
        right: 0;
        width: 42px;
        height: 42px;
        border-top: 1px solid rgba(103, 232, 249, 0.55);
        border-right: 1px solid rgba(103, 232, 249, 0.55);
        content: "";
        opacity: 0.55;
    }
}

.host-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 11px;
}

.host-title {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;

    strong {
        overflow: hidden;
        color: #e5f3fb;
        font-size: 0.82rem;
        font-weight: 600;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
}

.host-kicker,
.host-state,
.label,
.metric-head {
    font-family: var(--font-mono);
    letter-spacing: 0.05em;
}

.host-kicker {
    color: #62d9f5;
    font-size: 0.58rem;
}

.host-state {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #75e5b8;
    font-size: 0.58rem;
}

.host-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #34d399;
    box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.13), 0 0 10px rgba(52, 211, 153, 0.55);
}

.host-facts {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;

    > div {
        display: grid;
        grid-template-columns: 86px minmax(0, 1fr);
        gap: 8px;
        min-width: 0;
        align-items: baseline;
    }
}

.label {
    color: #6e8da1;
    font-size: 0.58rem;
    white-space: nowrap;
}

code,
.host-facts span:last-child {
    overflow: hidden;
    color: #c3cfdb;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.host-metrics {
    display: grid;
    gap: 9px;
    padding-top: 10px;
    border-top: 1px solid rgba(56, 189, 248, 0.15);
}

.host-metric {
    min-width: 0;
}

.metric-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    color: #7794a5;
    font-size: 0.59rem;

    span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    small {
        color: #5d7889;
        font-size: 0.55rem;
        letter-spacing: 0;
    }

    strong {
        color: #d7f5ff;
        font-size: 0.68rem;
        font-weight: 500;
        letter-spacing: 0;
        white-space: nowrap;
    }
}

.metric-track {
    height: 3px;
    margin-top: 5px;
    overflow: hidden;
    border-radius: 2px;
    background: rgba(71, 100, 117, 0.3);

    span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #22d3ee, #67e8f9);
        box-shadow: 0 0 8px rgba(34, 211, 238, 0.6);
        transition: width 250ms ease;
    }
}

.host-uptime .metric-head strong {
    color: #75e5b8;
}

.host-stats.compact {
    display: grid;
    grid-template-columns: minmax(150px, 0.85fr) minmax(250px, 1.25fr) minmax(300px, 2fr);
    align-items: center;
    gap: 16px;
    min-height: 64px;
    padding: 9px 11px;

    .host-header {
        margin-bottom: 0;
    }

    .host-facts {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 12px;
        margin-bottom: 0;

        > div {
            display: flex;
            align-items: baseline;
            gap: 5px;
        }
    }

    .host-metrics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        padding-top: 0;
        border-top: 0;
    }

    .metric-head {
        display: block;

        strong {
            display: block;
            margin-top: 2px;
        }
    }

    .metric-track {
        margin-top: 4px;
    }
}

@media (max-width: 900px) {
    .host-stats.compact {
        display: block;

        .host-header {
            margin-bottom: 8px;
        }

        .host-facts {
            margin-bottom: 8px;
        }

        .host-metrics {
            display: grid;
            padding-top: 8px;
            border-top: 1px solid rgba(56, 189, 248, 0.15);
        }
    }
}
</style>
