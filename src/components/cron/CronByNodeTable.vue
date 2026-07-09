<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2, Pencil } from "lucide-vue-next";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CronTask } from "@/composables/useCron";

interface NodeItem {
  uuid: string;
  customName: string;
}

const props = defineProps<{
  loading?: boolean;
  nodes: NodeItem[];
  agentTasks: CronTask[];
  savingNodeUuid?: string | null;
}>();

const emit = defineEmits<{
  editTasks: [node: NodeItem];
}>();

const { t } = useI18n();

const rows = computed(() =>
  props.nodes.map((node) => ({
    node,
    tasks: props.agentTasks.filter((task) => task.agentIds.includes(node.uuid)),
  })),
);
</script>

<template>
  <div class="relative w-full">
    <div
      v-if="loading && nodes.length"
      class="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-md bg-background/40 backdrop-blur-[1px]"
    >
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
    <Table class="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead class="w-[15%]">{{
            t("dashboard.cron.nodeName")
          }}</TableHead>
          <TableHead class="w-[75%]">{{
            t("dashboard.cron.linkedTasks")
          }}</TableHead>
          <TableHead class="w-[10%] text-center">{{
            t("dashboard.cron.actions")
          }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="loading && !nodes.length">
          <TableCell colspan="3" class="h-32 text-center text-muted-foreground">
            <div class="flex flex-col items-center justify-center space-y-3">
              <Loader2 class="h-6 w-6 animate-spin text-muted-foreground/50" />
              <span class="text-sm font-medium">{{ t("common.loading") }}</span>
            </div>
          </TableCell>
        </TableRow>
        <TableRow v-else-if="!nodes.length">
          <TableCell
            colspan="3"
            class="py-12 text-center text-muted-foreground"
          >
            {{ t("dashboard.cron.noNodes") }}
          </TableCell>
        </TableRow>
        <TableRow v-for="row in rows" :key="row.node.uuid">
          <TableCell class="overflow-hidden">
            <span class="block truncate text-sm font-medium">{{
              row.node.customName || row.node.uuid
            }}</span>
          </TableCell>
          <TableCell class="overflow-hidden">
            <div v-if="row.tasks.length" class="flex flex-wrap gap-1">
              <Badge
                v-for="task in row.tasks"
                :key="task.name"
                variant="outline"
                class="max-w-full truncate"
                :title="task.name"
              >
                {{ task.name }}
              </Badge>
            </div>
            <span v-else class="text-sm text-muted-foreground">{{
              t("dashboard.cron.noLinkedTasks")
            }}</span>
          </TableCell>
          <TableCell class="text-center">
            <Button
              size="icon"
              variant="ghost"
              class="h-7 w-7"
              :disabled="savingNodeUuid === row.node.uuid"
              @click="emit('editTasks', row.node)"
            >
              <Loader2
                v-if="savingNodeUuid === row.node.uuid"
                class="h-3.5 w-3.5 animate-spin"
              />
              <Pencil v-else class="h-3.5 w-3.5" />
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
