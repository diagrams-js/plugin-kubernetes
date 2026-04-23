/**
 * Kubernetes Plugin for diagrams-js
 *
 * This plugin provides import/export capabilities for Kubernetes YAML manifests.
 * It can import Kubernetes YAML files to create diagrams and export diagrams
 * to Kubernetes YAML format.
 *
 * This plugin demonstrates best practices for creating plugins:
 * - Uses Diagram.import() with JSON to create nodes with proper provider icons
 * - Does not rely on internal library implementations
 * - Converts external format to JSON, then imports via standard API
 */

// Type imports from diagrams-js - these are only types, not runtime imports
// Runtime exports are accessed via context.lib to avoid multiple instances
import type {
  DiagramsPlugin,
  ImporterCapability,
  ExporterCapability,
  ImportContext,
  ExportContext,
  Diagram,
  DiagramJSON,
  DiagramNodeJSON,
  DiagramEdgeJSON,
  DiagramClusterJSON,
  Yaml,
} from "diagrams-js";

/**
 * Kubernetes resource metadata
 */
interface K8sMetadata {
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

/**
 * Kubernetes Deployment spec
 */
interface K8sDeploymentSpec {
  replicas?: number;
  selector: {
    matchLabels: Record<string, string>;
  };
  template: {
    metadata?: {
      labels?: Record<string, string>;
    };
    spec: {
      containers: K8sContainer[];
      volumes?: { name: string; persistentVolumeClaim?: { claimName: string } }[];
    };
  };
}

/**
 * Kubernetes Service spec
 */
interface K8sServiceSpec {
  selector?: Record<string, string>;
  ports?: K8sServicePort[];
  type?: string;
}

/**
 * Kubernetes Service port
 */
interface K8sServicePort {
  port: number;
  targetPort?: number | string;
  protocol?: string;
  name?: string;
}

/**
 * Kubernetes Container
 */
interface K8sContainer {
  name: string;
  image: string;
  ports?: { containerPort: number; protocol?: string; name?: string }[];
  env?: { name: string; value?: string; valueFrom?: unknown }[];
  resources?: {
    limits?: Record<string, string>;
    requests?: Record<string, string>;
  };
  volumeMounts?: { name: string; mountPath: string }[];
}

/**
 * Kubernetes ConfigMap/Secret data
 */
interface K8sConfigMapSecretData {
  [key: string]: string;
}

/**
 * Kubernetes PersistentVolumeClaim spec
 */
interface K8sPVCSpec {
  accessModes?: string[];
  resources?: {
    requests?: {
      storage?: string;
    };
  };
  storageClassName?: string;
}

/**
 * Generic Kubernetes resource
 */
interface K8sResource {
  apiVersion: string;
  kind: string;
  metadata: K8sMetadata;
  spec?:
    | K8sDeploymentSpec
    | K8sServiceSpec
    | K8sConfigMapSecretData
    | K8sPVCSpec
    | Record<string, unknown>;
  data?: K8sConfigMapSecretData;
  stringData?: K8sConfigMapSecretData;
}

/**
 * Resource kind to provider mapping result
 */
type ResourceMappingResult =
  | { provider: string; type: string; resource: string; url?: undefined }
  | { url: string; provider?: undefined; type?: undefined; resource?: undefined };

/**
 * Resource info from findResource
 */
interface ResourceInfo {
  provider: string;
  type: string;
  resource: string;
}

/**
 * Resource mapping types for Kubernetes plugin
 */
export type ImageMappings = Record<
  string,
  | { provider: string; type: string; resource: string }
  | { url: string }
  | { iconify: string }
  | string
>;

/**
 * Cache for resource lookups to avoid repeated searches
 */
const resourceCache = new Map<string, ResourceMappingResult>();

let findResource: (query: string) => ResourceInfo[];

/**
 * Common Docker image name mappings to resource names
 * These are Docker images that don't directly match their resource names
 */
const DOCKER_IMAGE_ALIASES: Record<string, string> = {
  node: "Nodejs",
  golang: "Go",
  "c-sharp": "Dotnet",
  "c#": "Dotnet",
  postgres: "Postgresql",
  mongo: "Mongodb",
  httpd: "Apache",
};

/**
 * Maps Kubernetes container images to provider node types using findResource
 */
function getProviderForImage(image: string): ResourceMappingResult {
  if (!image || image.trim() === "") {
    return {
      provider: "onprem",
      type: "container",
      resource: "Docker",
    };
  }

  const lowerImage = image.toLowerCase();
  const imageName = lowerImage.split("/").pop()?.split(":")[0]?.split("@")[0] || "";

  // Check cache
  if (resourceCache.has(imageName)) {
    return resourceCache.get(imageName)!;
  }

  // Check for Docker image aliases first
  // e.g., "node" -> search for "Nodejs" instead
  const searchTerm = DOCKER_IMAGE_ALIASES[imageName] || imageName;

  // Search for matching resources using findResource from context
  // This dynamically discovers provider icons from all available resources
  if (findResource) {
    const matches = findResource(searchTerm);

    // If we found matches, use the best one (exact match is first due to sorting)
    if (matches.length > 0) {
      const bestMatch = matches[0];
      const result = {
        provider: bestMatch.provider,
        type: bestMatch.type,
        resource: bestMatch.resource,
      };
      resourceCache.set(imageName, result);
      return result;
    }

    // Fallback: try searching with common suffixes removed
    // e.g., "postgresql" -> "postgres"
    const baseName = imageName.replace(/db$/, "").replace(/sql$/, "");
    if (baseName !== imageName) {
      const baseMatches = findResource(baseName);
      if (baseMatches.length > 0) {
        const bestMatch = baseMatches[0];
        const result = {
          provider: bestMatch.provider,
          type: bestMatch.type,
          resource: bestMatch.resource,
        };
        resourceCache.set(imageName, result);
        return result;
      }
    }
  }

  // Default to generic container
  const defaultResult = {
    provider: "onprem",
    type: "container",
    resource: "Docker",
  };
  resourceCache.set(imageName, defaultResult);
  return defaultResult;
}

/**
 * Maps Kubernetes resource kinds to provider node types
 */
function getProviderForKind(
  kind: string,
  imageMappings: ImageMappings = {},
  resourceName?: string,
): ResourceMappingResult {
  // Check custom image mappings by resource name first
  if (resourceName && imageMappings[resourceName]) {
    const customMapping = imageMappings[resourceName];
    if (typeof customMapping === "string") {
      return { url: customMapping };
    }
    if ("url" in customMapping) {
      return { url: customMapping.url };
    }
    if ("iconify" in customMapping) {
      const iconifyUrl = `https://api.iconify.design/${customMapping.iconify}.svg`;
      return { url: iconifyUrl };
    }
    return customMapping;
  }

  // Check custom image mappings by kind
  const customMapping = imageMappings[kind];
  if (customMapping) {
    if (typeof customMapping === "string") {
      return { url: customMapping };
    }
    if ("url" in customMapping) {
      return { url: customMapping.url };
    }
    if ("iconify" in customMapping) {
      const iconifyUrl = `https://api.iconify.design/${customMapping.iconify}.svg`;
      return { url: iconifyUrl };
    }
    return customMapping;
  }

  // Map built-in kinds to k8s provider resources based on k8s.mdx documentation
  const kindMappings: Record<string, { provider: string; type: string; resource: string }> = {
    // k8s/compute
    Deployment: { provider: "k8s", type: "compute", resource: "Deploy" },
    StatefulSet: { provider: "k8s", type: "compute", resource: "STS" },
    DaemonSet: { provider: "k8s", type: "compute", resource: "DS" },
    ReplicaSet: { provider: "k8s", type: "compute", resource: "RS" },
    Pod: { provider: "k8s", type: "compute", resource: "Pod" },
    Job: { provider: "k8s", type: "compute", resource: "Job" },
    CronJob: { provider: "k8s", type: "compute", resource: "Cronjob" },

    // k8s/network
    Service: { provider: "k8s", type: "network", resource: "SVC" },
    Ingress: { provider: "k8s", type: "network", resource: "Ing" },
    NetworkPolicy: { provider: "k8s", type: "network", resource: "Netpol" },
    Endpoint: { provider: "k8s", type: "network", resource: "Ep" },
    Endpoints: { provider: "k8s", type: "network", resource: "Ep" },

    // k8s/podconfig
    ConfigMap: { provider: "k8s", type: "podconfig", resource: "CM" },
    Secret: { provider: "k8s", type: "podconfig", resource: "Secret" },

    // k8s/storage
    PersistentVolume: { provider: "k8s", type: "storage", resource: "PV" },
    PersistentVolumeClaim: { provider: "k8s", type: "storage", resource: "PVC" },
    StorageClass: { provider: "k8s", type: "storage", resource: "SC" },
    Volume: { provider: "k8s", type: "storage", resource: "Vol" },

    // k8s/rbac
    Role: { provider: "k8s", type: "rbac", resource: "Role" },
    RoleBinding: { provider: "k8s", type: "rbac", resource: "RB" },
    ClusterRole: { provider: "k8s", type: "rbac", resource: "CRole" },
    ClusterRoleBinding: { provider: "k8s", type: "rbac", resource: "CRB" },
    ServiceAccount: { provider: "k8s", type: "rbac", resource: "SA" },
    User: { provider: "k8s", type: "rbac", resource: "User" },
    Group: { provider: "k8s", type: "rbac", resource: "Group" },

    // k8s/group
    Namespace: { provider: "k8s", type: "group", resource: "NS" },

    // k8s/infra
    Node: { provider: "k8s", type: "infra", resource: "Node" },
    ETCD: { provider: "k8s", type: "infra", resource: "ETCD" },
    Master: { provider: "k8s", type: "infra", resource: "Master" },

    // k8s/clusterconfig
    HorizontalPodAutoscaler: { provider: "k8s", type: "clusterconfig", resource: "HPA" },
    ResourceQuota: { provider: "k8s", type: "clusterconfig", resource: "Quota" },
    LimitRange: { provider: "k8s", type: "clusterconfig", resource: "Limits" },

    // k8s/controlplane
    APIServer: { provider: "k8s", type: "controlplane", resource: "API" },
    ControllerManager: { provider: "k8s", type: "controlplane", resource: "CCM" },
    Scheduler: { provider: "k8s", type: "controlplane", resource: "Sched" },
    Kubelet: { provider: "k8s", type: "controlplane", resource: "Kubelet" },
    KProxy: { provider: "k8s", type: "controlplane", resource: "KProxy" },

    // k8s/chaos
    ChaosMesh: { provider: "k8s", type: "chaos", resource: "ChaosMesh" },
    LitmusChaos: { provider: "k8s", type: "chaos", resource: "LitmusChaos" },

    // k8s/ecosystem
    Helm: { provider: "k8s", type: "ecosystem", resource: "Helm" },
    Kustomize: { provider: "k8s", type: "ecosystem", resource: "Kustomize" },
    Krew: { provider: "k8s", type: "ecosystem", resource: "Krew" },
    ExternalDns: { provider: "k8s", type: "ecosystem", resource: "ExternalDns" },

    // k8s/others
    CustomResourceDefinition: { provider: "k8s", type: "others", resource: "CRD" },
    PodSecurityPolicy: { provider: "k8s", type: "others", resource: "PSP" },
  };

  if (kindMappings[kind]) {
    return kindMappings[kind];
  }

  // Default to generic k8s resource
  return {
    provider: "k8s",
    type: "cluster",
    resource: "Api",
  };
}

/**
 * Kubernetes plugin configuration options
 */
export interface KubernetesPluginConfig {
  /** Default namespace for exports (default: "default") */
  defaultNamespace?: string;
  /** Default API version for exports */
  defaultApiVersion?: string;
  /**
   * Custom image to icon mappings.
   * Can be either a provider icon mapping, a custom image URL, or an Iconify icon.
   */
  imageMappings?: ImageMappings;
}

/**
 * Validate Iconify icon format
 */
function validateIconifyFormat(key: string, value: string): void {
  if (!value.includes(":")) {
    console.warn(
      `[kubernetes-plugin] Invalid Iconify format for "${key}": "${value}". ` +
        `Expected format: "prefix:name" (e.g., "logos:kubernetes")`,
    );
  }
}

/**
 * Validate resource mappings configuration
 */
function validateImageMappings(imageMappings?: ImageMappings): void {
  if (!imageMappings) return;

  for (const [key, value] of Object.entries(imageMappings)) {
    if (typeof value === "object" && "iconify" in value) {
      validateIconifyFormat(key, value.iconify);
    }
  }
}

let yaml: Yaml | undefined;

/**
 * Create the Kubernetes plugin
 *
 * This plugin provides import/export capabilities for Kubernetes YAML manifests.
 *
 * @param config - Optional plugin configuration
 * @returns The Kubernetes plugin instance
 *
 * @example
 * ```typescript
 * import { Diagram } from "diagrams-js";
 * import { createKubernetesPlugin } from "@diagrams-js/plugin-kubernetes";
 *
 * const diagram = Diagram('My K8s App');
 * const plugin = createKubernetesPlugin();
 * await diagram.registerPlugins([plugin]);
 *
 * // Import from Kubernetes YAML
 * const k8sYaml = await fs.readFile('deployment.yaml', 'utf-8');
 * await diagram.import(k8sYaml, 'kubernetes');
 *
 * // Export to Kubernetes YAML
 * const k8sOutput = await diagram.export('kubernetes');
 * ```
 *
 * @example
 * // With custom image mappings
 * const plugin = createKubernetesPlugin({
 *   defaultNamespace: "production",
 *   imageMappings: {
 *     // Provider icons
 *     "my-custom-deployment": { provider: "k8s", type: "compute", resource: "Deploy" },
 *     // Custom URL
 *     "my-service": "https://example.com/icon.svg",
 *     // Iconify icons (https://iconify.design/)
 *     "custom-resource": { iconify: "logos:kubernetes" }
 *   }
 * });
 * await diagram.registerPlugins([plugin]);
 * ```
 */
export function createKubernetesPlugin(config?: KubernetesPluginConfig): DiagramsPlugin {
  // Validate configuration on creation
  validateImageMappings(config?.imageMappings);

  return {
    name: "kubernetes",
    version: "1.0.0",
    apiVersion: "1.0",
    runtimeSupport: {
      node: true,
      browser: true,
      deno: true,
      bun: true,
    },
    initialize: async (_config, context) => {
      const [yamlModule, resourcesList] = await Promise.all([
        context.loadYaml(),
        context.loadResourcesList(),
      ]);
      if (yamlModule) {
        yaml = yamlModule;
      }
      if (resourcesList?.findResource) {
        findResource = resourcesList.findResource;
      }
    },
    capabilities: [
      {
        type: "importer",
        name: "kubernetes",
        extensions: [".yml", ".yaml"],
        mimeTypes: ["text/yaml", "application/x-yaml"],

        canImport: async (source: string | string[], _context: ImportContext): Promise<boolean> => {
          const sources = Array.isArray(source) ? source : [source];
          for (const src of sources) {
            // Check for Kubernetes-specific patterns
            if (
              src.includes("apiVersion:") &&
              (src.includes("kind:") || src.includes("metadata:"))
            ) {
              return true;
            }
          }
          return false;
        },

        import: async (
          source: string | string[],
          diagram: Diagram,
          _context: ImportContext,
        ): Promise<void> => {
          const sources = Array.isArray(source) ? source : [source];

          for (const src of sources) {
            // Parse all documents in the YAML (multi-doc support)
            const resources = parseK8sManifest(src);

            // Convert Kubernetes resources to diagrams-js JSON format
            const json = k8sToJSON(resources, config?.imageMappings);

            // Use the built-in JSON importer to merge the JSON into the target diagram
            await diagram.import(JSON.stringify(json), "json");
          }
        },
      } as ImporterCapability,

      {
        type: "exporter",
        name: "kubernetes",
        extension: ".yaml",
        mimeType: "text/yaml",

        export: async (diagram: Diagram, _context: ExportContext): Promise<string> => {
          const diagramJson = diagram.toJSON();

          // Group resources by namespace for cleaner output
          const resources: K8sResource[] = [];

          // Process nodes to create resources
          for (const node of diagramJson.nodes) {
            const metadata = node.metadata?.kubernetes || {};
            const kind = metadata.kind || "Deployment";
            const name = (node.label || "unnamed").toLowerCase().replace(/\s+/g, "-");

            // Skip non-Kubernetes nodes (those without kubernetes metadata)
            if (!node.metadata?.kubernetes) {
              continue;
            }

            // Skip Pod nodes that were created for replica visualization (they have parentKind)
            if (kind === "Pod" && metadata.parentKind) {
              continue;
            }

            const namespace = metadata.namespace || config?.defaultNamespace || "default";

            // Build metadata - only include labels/annotations if they exist
            const resourceMetadata: K8sMetadata = { name, namespace };
            if (metadata.labels && Object.keys(metadata.labels).length > 0) {
              resourceMetadata.labels = metadata.labels;
            }
            if (metadata.annotations && Object.keys(metadata.annotations).length > 0) {
              resourceMetadata.annotations = metadata.annotations;
            }

            const resource: K8sResource = {
              apiVersion: metadata.apiVersion || getDefaultApiVersion(kind),
              kind,
              metadata: resourceMetadata,
            };

            // Use the original spec directly if available
            if (metadata.spec) {
              resource.spec = metadata.spec;
            } else if (kind === "ConfigMap" || kind === "Secret") {
              // For ConfigMap/Secret, data might be stored directly
              if (metadata.data) {
                resource.data = metadata.data;
              }
              if (kind === "Secret" && metadata.stringData) {
                resource.stringData = metadata.stringData;
              }
            }

            resources.push(resource);
          }

          // Convert to YAML
          return stringifyK8sManifest(resources);
        },
      } as ExporterCapability,
    ],
  };
}

/**
 * Get default API version for a Kubernetes kind
 */
function getDefaultApiVersion(kind: string): string {
  const apiVersions: Record<string, string> = {
    Deployment: "apps/v1",
    StatefulSet: "apps/v1",
    DaemonSet: "apps/v1",
    ReplicaSet: "apps/v1",
    Service: "v1",
    ConfigMap: "v1",
    Secret: "v1",
    PersistentVolume: "v1",
    PersistentVolumeClaim: "v1",
    Namespace: "v1",
    Pod: "v1",
    Job: "batch/v1",
    CronJob: "batch/v1",
    Ingress: "networking.k8s.io/v1",
    NetworkPolicy: "networking.k8s.io/v1",
    Role: "rbac.authorization.k8s.io/v1",
    RoleBinding: "rbac.authorization.k8s.io/v1",
    ClusterRole: "rbac.authorization.k8s.io/v1",
    ClusterRoleBinding: "rbac.authorization.k8s.io/v1",
    ServiceAccount: "v1",
    HorizontalPodAutoscaler: "autoscaling/v2",
  };

  return apiVersions[kind] || "v1";
}

/**
 * Parse a Kubernetes YAML manifest (supports multi-document)
 */
function parseK8sManifest(yamlContent: string): K8sResource[] {
  if (!yaml) {
    throw new Error("Failed to load Kubernetes manifest parser");
  }

  // Use loadAll to support multi-document YAML
  const docs = yaml.loadAll(yamlContent) as (K8sResource | null)[];

  return docs
    .filter((doc): doc is K8sResource => doc !== null && typeof doc === "object")
    .filter((doc) => doc.apiVersion && doc.kind);
}

/**
 * Convert Kubernetes resources to diagrams-js JSON format
 */
function k8sToJSON(resources: K8sResource[], imageMappings: ImageMappings = {}): DiagramJSON {
  const nodes: DiagramNodeJSON[] = [];
  const edges: DiagramEdgeJSON[] = [];
  const clusterNodes: string[] = [];

  // Group resources by namespace for clustering
  const namespaceGroups = new Map<string, string[]>();

  for (const resource of resources) {
    const kind = resource.kind;
    const name = resource.metadata.name;
    const namespace = resource.metadata.namespace || "default";
    const nodeId = namespace === "default" ? name : `${namespace}/${name}`;

    const providerInfo = getProviderForKind(kind, imageMappings, name);

    const node: DiagramNodeJSON = {
      id: nodeId,
      label: name,
      metadata: {
        kubernetes: {
          apiVersion: resource.apiVersion,
          kind,
          namespace,
          labels: resource.metadata.labels,
          annotations: resource.metadata.annotations,
          // Store the entire resource spec for round-trip
          spec: resource.spec,
          data: resource.data,
          stringData: resource.stringData,
        },
      },
    };

    // Add provider info or custom icon URL
    if ("url" in providerInfo) {
      node.iconUrl = providerInfo.url;
    } else {
      node.provider = providerInfo.provider;
      node.type = providerInfo.type;
      node.resource = providerInfo.resource;
    }

    nodes.push(node);
    clusterNodes.push(nodeId);

    // Add to namespace group
    if (!namespaceGroups.has(namespace)) {
      namespaceGroups.set(namespace, []);
    }
    namespaceGroups.get(namespace)!.push(nodeId);

    // Create edges for specific relationships
    // Handle workload resources that have replicas and containers
    const workloadKinds = ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Job"];
    if (workloadKinds.includes(kind) && resource.spec) {
      const spec = resource.spec as K8sDeploymentSpec;
      const replicas = spec.replicas || 1;
      const containers = spec.template?.spec?.containers || [];
      const firstContainer = containers[0];

      if (firstContainer) {
        // Create Pod nodes for each replica (using container image)
        const containerProvider = getProviderForImage(firstContainer.image);

        for (let i = 0; i < replicas; i++) {
          const podNodeId = `${nodeId}-pod-${i}`;

          const podNode: DiagramNodeJSON = {
            id: podNodeId,
            label: replicas === 1 ? name : `${name}-${i}`,
            metadata: {
              kubernetes: {
                kind: "Pod",
                parentKind: kind,
                parentName: name,
                namespace,
                image: firstContainer.image,
                ports: firstContainer.ports,
                env: firstContainer.env,
                replicaIndex: i,
              },
            },
          };

          if ("url" in containerProvider) {
            podNode.iconUrl = containerProvider.url;
          } else {
            podNode.provider = containerProvider.provider;
            podNode.type = containerProvider.type;
            podNode.resource = containerProvider.resource;
          }

          nodes.push(podNode);
          clusterNodes.push(podNodeId);
          namespaceGroups.get(namespace)!.push(podNodeId);
          edges.push({
            from: nodeId,
            to: podNodeId,
            direction: "forward",
          });
        }
      }
    }

    if (kind === "Service" && resource.spec) {
      const spec = resource.spec as K8sServiceSpec;
      // Connect to pods/deployments based on selector
      if (spec.selector) {
        // Find matching deployments/pods
        for (const otherResource of resources) {
          // Get labels from different locations depending on resource type
          let labels: Record<string, string> | undefined;

          if (
            otherResource.kind === "Deployment" ||
            otherResource.kind === "StatefulSet" ||
            otherResource.kind === "DaemonSet" ||
            otherResource.kind === "ReplicaSet" ||
            otherResource.kind === "Job"
          ) {
            // For workloads, check both spec.selector.matchLabels and spec.template.metadata.labels
            const workloadSpec = otherResource.spec as K8sDeploymentSpec | undefined;
            labels =
              workloadSpec?.selector?.matchLabels || workloadSpec?.template?.metadata?.labels;
          } else if (otherResource.kind === "Pod") {
            // For pods, labels can be in metadata.labels
            labels = otherResource.metadata.labels;
          }

          if (labels) {
            const matches = Object.entries(spec.selector).every(
              ([key, value]) => labels?.[key] === value,
            );

            if (matches) {
              // Calculate target ID using the same logic as node creation
              const targetNamespace = otherResource.metadata.namespace || "default";
              const targetId =
                targetNamespace === "default"
                  ? otherResource.metadata.name
                  : `${targetNamespace}/${otherResource.metadata.name}`;
              edges.push({
                from: nodeId,
                to: targetId,
                direction: "forward",
                label: "selects",
              });
            }
          }
        }
      }
    }

    if (kind === "PersistentVolumeClaim" && resource.spec) {
      // Connect to deployments that mount this PVC
      for (const otherResource of resources) {
        if (otherResource.kind === "Deployment" && otherResource.spec) {
          const spec = otherResource.spec as K8sDeploymentSpec;
          const volumes = spec.template?.spec?.volumes || [];
          for (const vol of volumes) {
            if (vol.persistentVolumeClaim?.claimName === name || vol.name === name) {
              // Calculate target ID using the same logic as node creation
              const targetNamespace = otherResource.metadata.namespace || "default";
              const targetId =
                targetNamespace === "default"
                  ? otherResource.metadata.name
                  : `${targetNamespace}/${otherResource.metadata.name}`;
              edges.push({
                from: targetId,
                to: nodeId,
                direction: "forward",
                label: "mounts",
              });
            }
          }
        }
      }
    }
  }

  // Create clusters for namespaces (if more than one namespace)
  const clusters: DiagramClusterJSON[] = [];
  if (namespaceGroups.size > 1) {
    for (const [namespace, nsNodes] of namespaceGroups) {
      clusters.push({
        label: namespace,
        nodes: nsNodes,
      });
    }
  } else if (clusterNodes.length > 0) {
    // Single cluster for all resources
    clusters.push({
      label: "Kubernetes Resources",
      nodes: clusterNodes,
    });
  }

  return {
    name: "Kubernetes Manifest",
    nodes,
    edges: edges.length > 0 ? edges : undefined,
    clusters: clusters.length > 0 ? clusters : undefined,
  };
}

/**
 * Convert Kubernetes resources to YAML string
 */
function stringifyK8sManifest(resources: K8sResource[]): string {
  if (!yaml) {
    throw new Error("YAML module not initialized");
  }

  if (resources.length === 0) {
    return "# No Kubernetes resources found\n";
  }

  if (resources.length === 1) {
    return yaml.dump(resources[0]);
  }

  // Multi-document YAML
  const docs = resources.map((r) => yaml!.dump(r));
  return docs.join("---\n");
}

/**
 * Default Kubernetes plugin instance (without configuration)
 * Exported for convenience. Use this when you don't need custom configuration.
 *
 * @example
 * ```typescript
 * import { kubernetesPlugin } from "@diagrams-js/plugin-kubernetes";
 *
 * // Use the pre-created instance (no configuration)
 * await diagram.registerPlugins([kubernetesPlugin]);
 * ```
 *
 * For custom configuration, use the factory function:
 * ```typescript
 * await diagram.registerPlugins([createKubernetesPlugin({ defaultNamespace: "production" })]);
 * ```
 */
export const kubernetesPlugin = createKubernetesPlugin();
