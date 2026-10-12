<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Badge } from "@/components/ui/badge";
import { getVersionChannel, isOlderVersion } from "@/utils/nodeVersion";

const props = defineProps<{
  /** 节点的版本号，保留 rc、nightly 后缀，不含提交号。 */
  version: string;
  /** 最新的正式版版本号。 */
  latest: string;
}>();

const { t } = useI18n();
const channel = computed(() => getVersionChannel(props.version));
// 同号预发布版本也应提示可以升级到正式版。
const outdated = computed(() => isOlderVersion(props.version, props.latest));
</script>

<template>
  <Badge
    v-if="channel === 'nightly'"
    variant="outline"
    class="ml-2 bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
    >{{ t("common.channelNightly") }}</Badge
  >
  <Badge
    v-else-if="channel === 'prerelease'"
    variant="outline"
    class="ml-2 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"
    >{{ t("common.channelPrerelease") }}</Badge
  >
  <Badge
    v-if="outdated"
    variant="outline"
    class="ml-2 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
    >{{ t("common.updatable") }}</Badge
  >
  <!-- 数字版本更大的 nightly 只显示渠道，避免被标记为最新正式版。 -->
  <Badge
    v-else-if="channel === 'stable'"
    variant="outline"
    class="ml-2 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
    >{{ t("common.latestVersion") }}</Badge
  >
</template>
