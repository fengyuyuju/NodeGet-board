<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { CalendarCheck, Menu, Plus, RefreshCw } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CronTable from "@/components/cron/CronTable.vue";
import CronFormDialog from "@/components/cron/CronFormDialog.vue";
import { useCron, backendToTask, taskToCronType } from "@/composables/useCron";
import { useCronAgentOrder } from "@/composables/useCronAgentOrder";
import { useBackendStore } from "@/composables/useBackendStore";
import { getWsConnection } from "@/composables/useWsConnection";
import type { CronTask } from "@/composables/useCron";

definePage({
  meta: {
    title: "router.cron",
    icon: CalendarCheck,
    order: 6,
    group: "router.group.tools",
  },
});

export interface NodeItem {
  uuid: string;
  customName: string;
}

const { t } = useI18n();
const { currentBackend } = useBackendStore();
const cron = useCron();
const cronAgentOrder = useCronAgentOrder();

const tasks = ref<CronTask[]>([]);
const loading = ref(false);

// Task-type filter: agent / server
type TaskKindFilter = "agent" | "server";
const taskKindTab = ref<TaskKindFilter>("agent");

// Persisted agent-task display order (task names), loaded from KV.
const agentOrderNames = ref<string[]>([]);
const sortable = ref(false);
const orderSaving = ref(false);
const orderLoading = ref(false);
// Guards against a stale backend's late KV response overwriting the current one.
let backendLoadId = 0;

// KV-known names first (in order), unknown/new tasks appended by id.
const sortAgentTasksByOrder = (agentTasks: CronTask[]): CronTask[] => {
  const byName = new Map(agentTasks.map((task) => [task.name, task]));
  const ordered = agentOrderNames.value.flatMap((name) => {
    const task = byName.get(name);
    if (!task) return [];
    byName.delete(name);
    return [task];
  });
  return [...ordered, ...[...byName.values()].sort((a, b) => a.id - b.id)];
};
const filteredTasks = computed(() => {
  const filtered = tasks.value.filter((t) => t.taskKind === taskKindTab.value);
  return taskKindTab.value === "agent"
    ? sortAgentTasksByOrder(filtered)
    : filtered;
});
const nodes = ref<NodeItem[]>([]);
const togglingNames = ref<string[]>([]);
const deletingNames = ref<string[]>([]);
const saveLoading = ref(false);

const formatRpcSuccessMessage = (result: unknown, fallback: string) => {
  if (typeof result === "string" && result.trim()) return result;
  if (result && typeof result === "object" && "message" in result) {
    const message = (result as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

const getToggleEnabledState = (result: unknown, fallback: boolean) => {
  if (result && typeof result === "object" && "enabled" in result) {
    const enabled = (result as { enabled?: unknown }).enabled;
    if (typeof enabled === "boolean") return enabled;
  }
  return fallback;
};

const fetchNodes = async () => {
  if (!currentBackend.value?.url) {
    nodes.value = [];
    return;
  }
  try {
    const result = await getWsConnection(currentBackend.value.url).call<{
      uuids: string[];
    }>("nodeget-server_list_all_agent_uuid", {
      token: currentBackend.value.token,
    });
    const uuids: string[] = result?.uuids ?? [];

    if (uuids.length === 0) {
      nodes.value = [];
      return;
    }

    const kvResult = await getWsConnection(currentBackend.value.url).call<
      { namespace: string; key: string; value: unknown }[]
    >("kv_get_multi_value", {
      token: currentBackend.value.token,
      namespace_key: uuids.flatMap((uuid) => [
        { namespace: uuid, key: "metadata_name" },
        { namespace: uuid, key: "metadata_order" },
      ]),
    });

    const nameMap = new Map<string, string>();
    const orderMap = new Map<string, number>();
    for (const item of Array.isArray(kvResult) ? kvResult : []) {
      if (item.key === "metadata_name") {
        nameMap.set(item.namespace, String(item.value ?? ""));
      } else if (item.key === "metadata_order") {
        const order = Number(item.value);
        if (!isNaN(order)) orderMap.set(item.namespace, order);
      }
    }

    nodes.value = uuids
      .map((uuid) => ({
        uuid,
        customName: nameMap.get(uuid) ?? "",
        order: orderMap.get(uuid),
      }))
      .sort((a, b) => {
        const aHas = a.order != null;
        const bHas = b.order != null;
        if (aHas && !bHas) return -1;
        if (!aHas && bHas) return 1;
        if (aHas && bHas) return a.order! - b.order!;
        return a.uuid.localeCompare(b.uuid);
      })
      .map(({ uuid, customName }) => ({ uuid, customName }));
  } catch {
    nodes.value = [];
  }
};

const loadTasks = async () => {
  loading.value = true;
  try {
    const list = await cron.list();
    tasks.value = [...list].sort((a, b) => a.id - b.id).map(backendToTask);
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : String(e));
  } finally {
    loading.value = false;
  }
};

const loadCronOrder = async (loadId = backendLoadId) => {
  orderLoading.value = true;
  try {
    const names = await cronAgentOrder.getNames();
    if (loadId === backendLoadId) agentOrderNames.value = names;
  } catch {
    if (loadId === backendLoadId) agentOrderNames.value = [];
  } finally {
    if (loadId === backendLoadId) orderLoading.value = false;
  }
};

watch(
  () => [currentBackend.value?.url, currentBackend.value?.token],
  async ([url]) => {
    const loadId = ++backendLoadId;
    // Any backend switch must exit sort mode and drop stale order.
    agentOrderNames.value = [];
    sortable.value = false;

    if (!url) {
      tasks.value = [];
      nodes.value = [];
      orderLoading.value = false;
      return;
    }

    await Promise.all([fetchNodes(), loadTasks(), loadCronOrder(loadId)]);
  },
  { immediate: true },
);

// Exit sort mode when leaving the Agent tab (no auto-save).
watch(taskKindTab, (tab) => {
  if (tab === "server") sortable.value = false;
});

// Form dialog
const formOpen = ref(false);
const editingTask = ref<CronTask | null>(null);
const formMode = ref<"create" | "edit" | "duplicate">("create");

const openCreate = () => {
  formMode.value = "create";
  editingTask.value = null;
  formOpen.value = true;
};

const openEdit = (task: CronTask) => {
  formMode.value = "edit";
  editingTask.value = task;
  formOpen.value = true;
};

const openDuplicate = (task: CronTask) => {
  formMode.value = "duplicate";
  editingTask.value = task;
  formOpen.value = true;
};

const handleSave = async (data: Omit<CronTask, "id"> & { id?: number }) => {
  if (saveLoading.value) return;
  const cron_type = taskToCronType(data);
  saveLoading.value = true;
  try {
    if (data.id !== undefined) {
      const result = await cron.edit({
        name: data.name,
        cron_expression: data.cronExpression,
        cron_type,
      });
      toast.success(
        formatRpcSuccessMessage(result, t("dashboard.cron.updateSuccess")),
      );
    } else {
      const result = await cron.create({
        name: data.name,
        cron_expression: data.cronExpression,
        cron_type,
      });
      toast.success(
        formatRpcSuccessMessage(result, t("dashboard.cron.createSuccess")),
      );
    }
    formOpen.value = false;
    await loadTasks();
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : String(e));
  } finally {
    saveLoading.value = false;
  }
};

const handleDelete = async (name: string) => {
  if (deletingNames.value.includes(name)) return;

  deletingNames.value = [...deletingNames.value, name];
  try {
    const result = await cron.remove(name);
    toast.success(
      formatRpcSuccessMessage(result, t("dashboard.cron.deleteSuccess")),
    );
    await loadTasks();
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : String(e));
  } finally {
    deletingNames.value = deletingNames.value.filter((item) => item !== name);
  }
};

const handleToggle = async (task: CronTask) => {
  if (togglingNames.value.includes(task.name)) return;

  const previousEnabled = task.enabled;
  const nextEnabled = !previousEnabled;
  task.enabled = nextEnabled;
  togglingNames.value = [...togglingNames.value, task.name];

  try {
    const result = await cron.setEnable(task.name, nextEnabled);
    const enabled = getToggleEnabledState(result, nextEnabled);
    task.enabled = enabled;
    toast.success(
      formatRpcSuccessMessage(
        result,
        enabled
          ? t("dashboard.cron.enableSuccess")
          : t("dashboard.cron.disableSuccess"),
      ),
    );
    await loadTasks();
  } catch (e: unknown) {
    task.enabled = previousEnabled;
    toast.error(e instanceof Error ? e.message : String(e));
  } finally {
    togglingNames.value = togglingNames.value.filter(
      (name) => name !== task.name,
    );
  }
};

const handleUpdateNodes = async (name: string, agentIds: string[]) => {
  const task = tasks.value.find((t) => t.name === name);
  if (!task) return;
  try {
    const updatedTask: CronTask = { ...task, agentIds };
    const cron_type = taskToCronType(updatedTask);
    await cron.edit({ name, cron_expression: task.cronExpression, cron_type });
    await loadTasks();
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : String(e));
  }
};

const handleReorder = (from: number, target: number) => {
  if (!sortable.value || taskKindTab.value !== "agent") return;
  const ordered = [...filteredTasks.value];
  if (
    from < 0 ||
    target < 0 ||
    from >= ordered.length ||
    target >= ordered.length
  ) {
    return;
  }
  const moved = ordered.splice(from, 1)[0];
  if (!moved) return;
  ordered.splice(target, 0, moved);
  agentOrderNames.value = ordered.map((task) => task.name);
};

const toggleSortable = async () => {
  // Entering sort mode is instant; exiting (Save) persists the order.
  if (!sortable.value) {
    sortable.value = true;
    return;
  }
  if (orderLoading.value || orderSaving.value) return;
  orderSaving.value = true;
  try {
    const names = filteredTasks.value.map((task) => task.name);
    await cronAgentOrder.setNames(names);
    agentOrderNames.value = names;
    sortable.value = false;
    toast.success(t("dashboard.cron.sortSaved"));
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : String(e));
  } finally {
    orderSaving.value = false;
  }
};
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-2xl font-semibold">{{ t("dashboard.cron.title") }}</h1>
        <p class="mt-1 text-sm text-muted-foreground">
          {{ t("dashboard.cron.desc") }}
        </p>
      </div>
      <Button
        variant="outline"
        :disabled="loading"
        class="mr-2 ml-auto"
        @click="() => loadTasks()"
      >
        <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />
      </Button>
      <Button @click="openCreate">
        <Plus class="mr-1.5 h-4 w-4" />
        {{ t("dashboard.cron.create") }}
      </Button>
    </div>

    <div class="flex items-center gap-3">
      <Tabs v-model="taskKindTab">
        <TabsList class="w-fit">
          <TabsTrigger value="agent">{{
            t("dashboard.cron.agentTaskTab")
          }}</TabsTrigger>
          <TabsTrigger value="server">{{
            t("dashboard.cron.serverTaskTab")
          }}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Button
        v-if="taskKindTab === 'agent'"
        size="sm"
        variant="outline"
        class="ml-auto"
        :disabled="
          loading || orderLoading || orderSaving || filteredTasks.length < 2
        "
        @click="toggleSortable"
      >
        <Menu class="mr-1.5 h-4 w-4" />
        {{
          sortable ? t("dashboard.cron.sortSave") : t("dashboard.cron.sortEdit")
        }}
      </Button>
    </div>

    <div class="rounded-md border">
      <CronTable
        :loading="loading"
        :tasks="filteredTasks"
        :nodes="nodes"
        :toggling-names="togglingNames"
        :deleting-names="deletingNames"
        :sortable="sortable"
        @edit="openEdit"
        @duplicate="openDuplicate"
        @delete="handleDelete"
        @toggle-enabled="handleToggle"
        @update-nodes="handleUpdateNodes"
        @reorder="handleReorder"
      />
    </div>

    <CronFormDialog
      v-model:open="formOpen"
      :mode="formMode"
      :task="editingTask"
      :nodes="nodes"
      :saving="saveLoading"
      @save="handleSave"
    />
  </div>
</template>
