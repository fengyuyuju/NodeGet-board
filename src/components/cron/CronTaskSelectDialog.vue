<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Loader2 } from "lucide-vue-next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { CronTask } from "@/composables/useCron";

const props = defineProps<{
  open: boolean;
  selectedNames: string[];
  tasks: CronTask[];
  saving?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [names: string[]];
}>();

const { t } = useI18n();

const localSelected = ref<string[]>([]);

watch([() => props.open, () => props.selectedNames], ([open, names]) => {
  if (open) {
    localSelected.value = [...names];
  }
});

const taskLabel = (task: CronTask) => {
  if (task.agentTaskType === "execute") {
    const args = task.agentExecuteArgs.join(" ");
    return args
      ? `execute: ${task.agentExecuteCommand} ${args}`
      : `execute: ${task.agentExecuteCommand}`;
  }
  return `${task.agentTaskType}: ${task.agentTaskTarget}`;
};

const toggle = (name: string, checked: boolean) => {
  if (checked) {
    if (!localSelected.value.includes(name)) {
      localSelected.value.push(name);
    }
  } else {
    const idx = localSelected.value.indexOf(name);
    if (idx !== -1) {
      localSelected.value.splice(idx, 1);
    }
  }
};

const isAllSelected = () => {
  return (
    props.tasks.length > 0 && localSelected.value.length === props.tasks.length
  );
};

const toggleSelectAll = () => {
  if (isAllSelected()) {
    localSelected.value = [];
  } else {
    localSelected.value = props.tasks.map((task) => task.name);
  }
};

// Defer closing to the parent: it stays open while saving so the spinner shows,
// then closes on success (see handleUpdateNodeTasks in cron.vue).
const handleConfirm = () => {
  emit("confirm", [...localSelected.value]);
};
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-h-[50dvh] sm:max-w-md"
      @escape-key-down="saving && $event.preventDefault()"
      @interact-outside="saving && $event.preventDefault()"
    >
      <DialogHeader>
        <DialogTitle>{{ t("dashboard.cron.selectTasks") }}</DialogTitle>
        <DialogDescription>{{
          t("dashboard.cron.selectTasksDesc")
        }}</DialogDescription>
      </DialogHeader>
      <div class="min-h-0 flex-1 space-y-2 overflow-y-auto py-2">
        <Button
          v-if="tasks.length > 0"
          variant="ghost"
          size="sm"
          class="ml-1"
          :disabled="saving"
          @click="toggleSelectAll"
        >
          {{
            isAllSelected()
              ? t("dashboard.cron.deselectAll")
              : t("dashboard.cron.selectAll")
          }}
        </Button>
        <div
          v-for="task in tasks"
          :key="task.name"
          class="flex items-center gap-3 rounded-md px-2 py-1.5"
        >
          <Checkbox
            :model-value="localSelected.includes(task.name)"
            :disabled="saving"
            @update:model-value="(checked) => toggle(task.name, !!checked)"
          />
          <div class="flex min-w-0 flex-col">
            <span class="truncate text-sm font-medium">{{ task.name }}</span>
            <span
              class="truncate font-mono text-xs text-muted-foreground"
              :title="taskLabel(task)"
              >{{ taskLabel(task) }}</span
            >
          </div>
        </div>
        <p
          v-if="!tasks.length"
          class="py-4 text-center text-sm text-muted-foreground"
        >
          {{ t("dashboard.cron.noAgentTasks") }}
        </p>
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          :disabled="saving"
          @click="emit('update:open', false)"
          >{{ t("dashboard.cron.cancel") }}</Button
        >
        <Button :disabled="saving" @click="handleConfirm">
          <Loader2 v-if="saving" class="mr-1.5 h-4 w-4 animate-spin" />
          {{ t("dashboard.save") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
