<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { Copy, GripVertical, History, Loader2, Pencil, Trash2 } from "lucide-vue-next";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PopConfirm } from "@/components/ui/pop-confirm";
import CronNodeSelectDialog from "./CronNodeSelectDialog.vue";
import { cn } from "@/lib/utils";
import type { CronTask } from "@/composables/useCron";

const props = defineProps<{
  tasks: CronTask[];
  nodes: { uuid: string; customName: string }[];
  togglingNames: string[];
  deletingNames: string[];
  loading?: boolean;
  sortable?: boolean;
}>();

const emit = defineEmits<{
  edit: [task: CronTask];
  duplicate: [task: CronTask];
  delete: [name: string];
  toggleEnabled: [task: CronTask];
  updateNodes: [name: string, agentIds: string[]];
  reorder: [from: number, target: number];
}>();

const { t } = useI18n();
const router = useRouter();

const nodeNameMap = computed(
  () =>
    new Map(
      props.nodes.map((node) => [node.uuid, node.customName || node.uuid]),
    ),
);

const taskKindVariant = (kind: string) => {
  return kind === "server" ? "secondary" : "default";
};

const taskLabel = (task: CronTask) => {
  if (task.taskKind === "server") {
    if (typeof task.serverTask === "string") {
      return task.serverTask;
    }
    return (
      `[worker]: ` +
      task.serverTask.js_worker[0] +
      ", params: " +
      JSON.stringify(task.serverTask.js_worker[1])
    );
  }
  if (task.agentTaskType === "execute") {
    const args = task.agentExecuteArgs.join(" ");
    return args
      ? `execute: ${task.agentExecuteCommand} ${args}`
      : `execute: ${task.agentExecuteCommand}`;
  }
  return `${task.agentTaskType}: ${task.agentTaskTarget}`;
};

const formatTime = (ts: number | null) => {
  if (!ts) return t("dashboard.cron.never");
  return new Date(ts).toLocaleString();
};

// 节点选择对话框
const nodeSelectOpen = ref(false);
const nodeSelectTask = ref<CronTask | null>(null);
const nodeSelectIds = ref<string[]>([]);

watch(
  () => nodeSelectOpen.value,
  (val) => {
    if (!val) nodeSelectTask.value = null;
  },
);

const handleNodeConfirm = (ids: string[]) => {
  if (nodeSelectTask.value) {
    emit("updateNodes", nodeSelectTask.value.name, ids);
  }
};

const openNodeSelect = (task: CronTask) => {
  nodeSelectTask.value = task;
  nodeSelectIds.value = [...task.agentIds];
  nodeSelectOpen.value = true;
};

const formatSingleNodeLabel = (agentId: string) => {
  const customName = nodeNameMap.value.get(agentId);
  if (customName && customName !== agentId) return customName;
  return t("dashboard.cron.nodeFallback", { suffix: agentId.slice(-6) });
};

const nodeBadgeLabel = (task: CronTask) => {
  if (!task.agentIds.length) return "x 0";
  if (task.agentIds.length === 1)
    return formatSingleNodeLabel(task.agentIds[0] ?? "");
  return `x ${task.agentIds.length}`;
};

const handleToggleEnabled = (task: CronTask) => {
  emit("toggleEnabled", task);
};

const openHistory = (task: CronTask) => {
  void router.push({
    name: "/dashboard/cron-history/[cronName]",
    params: { cronName: task.name },
    query: { taskType: task.taskKind },
  });
};

const isToggling = (name: string) => props.togglingNames.includes(name);
const isDeleting = (name: string) => props.deletingNames.includes(name);

// One extra column (drag handle) is rendered while sorting.
const tableColspan = computed(() => (props.sortable ? 8 : 7));

const onDragStart = (e: DragEvent, index: number) => {
  if (!props.sortable) return;
  e.dataTransfer?.setData("text/plain", String(index));
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
};

const onDragOver = (e: DragEvent) => {
  if (!props.sortable) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
};

const onDrop = (e: DragEvent, target: number) => {
  if (!props.sortable) return;
  e.preventDefault();
  const source = e.dataTransfer?.getData("text/plain") ?? "";
  const from = source.trim() ? Number(source) : Number.NaN;
  if (
    !Number.isInteger(from) ||
    from < 0 ||
    from >= props.tasks.length ||
    target < 0 ||
    target >= props.tasks.length ||
    from === target
  ) {
    return;
  }
  emit("reorder", from, target);
};
</script>

<template>
  <div class="relative w-full">
    <div
      v-if="loading && tasks.length"
      class="absolute inset-0 z-10 bg-background/40 backdrop-blur-[1px] flex flex-col items-center justify-center rounded-md"
    >
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
    <Table class="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead v-if="sortable" class="w-[60px]" />
          <TableHead class="w-[16%]">{{
            t("dashboard.cron.name")
          }}</TableHead>
          <TableHead class="w-[26%]">{{
            t("dashboard.cron.type")
          }}</TableHead>
          <TableHead class="w-[11%]">{{
            t("dashboard.cron.expression")
          }}</TableHead>
          <TableHead class="w-[8%]">{{
            t("dashboard.cron.nodes")
          }}</TableHead>
          <TableHead class="w-[16%]">{{
            t("dashboard.cron.lastRunTime")
          }}</TableHead>
          <TableHead class="w-[8%]">{{
            t("dashboard.cron.enabled")
          }}</TableHead>
          <TableHead class="w-[15%]">{{ t("dashboard.cron.actions") }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="loading && !tasks.length">
          <TableCell
            :colspan="tableColspan"
            class="h-32 text-center text-muted-foreground"
          >
            <div class="flex flex-col items-center justify-center space-y-3">
              <Loader2 class="w-6 h-6 animate-spin text-muted-foreground/50" />
              <span class="text-sm font-medium">{{ t("common.loading") }}</span>
            </div>
          </TableCell>
        </TableRow>
        <TableRow v-else-if="!tasks.length">
          <TableCell
            :colspan="tableColspan"
            class="text-center text-muted-foreground py-12"
          >
            {{ t("dashboard.cron.empty") }}
          </TableCell>
        </TableRow>
        <TableRow
          v-for="(task, index) in tasks"
          :key="task.id"
          :draggable="sortable"
          :class="sortable ? 'cursor-move select-none' : ''"
          @dragstart="(e: DragEvent) => onDragStart(e, index)"
          @dragover="onDragOver"
          @drop="(e: DragEvent) => onDrop(e, index)"
        >
          <TableCell v-if="sortable">
            <GripVertical class="h-4 w-4 text-muted-foreground" />
          </TableCell>
          <TableCell class="font-medium overflow-hidden truncate"
            >{{ task.name }}</TableCell
          >
          <TableCell class="align-top overflow-hidden">
            <div class="flex flex-col gap-1 min-w-0">
              <Badge :variant="taskKindVariant(task.taskKind)">{{
                task.taskKind
              }}</Badge>
              <span
                class="text-xs text-muted-foreground font-mono block truncate"
                :title="taskLabel(task)"
                >{{ taskLabel(task) }}</span
              >
            </div>
          </TableCell>
          <TableCell
            class="font-mono text-sm overflow-hidden truncate"
            >{{ task.cronExpression }}</TableCell
          >
          <TableCell class="overflow-hidden">
            <div
              v-if="task.taskKind === 'agent'"
              class="flex flex-col items-start gap-1 min-w-0 w-full"
            >
              <Badge
                variant="outline"
                class="cursor-pointer hover:bg-muted max-w-full truncate"
                :title="nodeBadgeLabel(task)"
                @click="openNodeSelect(task)"
              >
                {{ nodeBadgeLabel(task) }}
              </Badge>
            </div>
            <Badge v-else variant="outline">-</Badge>
          </TableCell>
          <TableCell
            class="text-sm text-muted-foreground overflow-hidden truncate"
            >{{ formatTime(task.lastRunTime) }}</TableCell
          >
          <TableCell>
            <button
              type="button"
              role="switch"
              :aria-checked="task.enabled"
              :aria-label="t('dashboard.cron.enabled')"
              :disabled="isToggling(task.name)"
              :class="
                cn(
                  'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  task.enabled ? 'bg-primary' : 'bg-input',
                  isToggling(task.name)
                    ? 'cursor-not-allowed opacity-50'
                    : 'cursor-pointer',
                )
              "
              @click.stop="handleToggleEnabled(task)"
            >
              <span
                :class="
                  cn(
                    'pointer-events-none flex h-4 w-4 items-center justify-center rounded-full bg-background shadow-lg ring-0 transition-transform',
                    task.enabled ? 'translate-x-4' : 'translate-x-0',
                  )
                "
              >
                <Loader2
                  v-if="isToggling(task.name)"
                  class="h-3 w-3 animate-spin text-muted-foreground"
                />
              </span>
            </button>
          </TableCell>
          <TableCell>
            <div class="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                class="h-7 w-7"
                @click="openHistory(task)"
              >
                <History class="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="h-7 w-7"
                @click="emit('edit', task)"
              >
                <Pencil class="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="h-7 w-7"
                @click="emit('duplicate', task)"
              >
                <Copy class="h-3.5 w-3.5" />
              </Button>
              <PopConfirm
                :description="
                  t('dashboard.cron.deleteConfirm', { name: task.name })
                "
                :loading="isDeleting(task.name)"
                @confirm="emit('delete', task.name)"
              >
                <Button
                  size="icon"
                  variant="ghost"
                  :disabled="isDeleting(task.name)"
                  class="h-7 w-7 text-destructive hover:text-destructive"
                >
                  <Trash2 class="h-3.5 w-3.5" />
                </Button>
              </PopConfirm>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>

  <CronNodeSelectDialog
    v-model:open="nodeSelectOpen"
    :selected-ids="nodeSelectIds"
    :nodes="nodes"
    @confirm="handleNodeConfirm"
  />
</template>
