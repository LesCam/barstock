import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface OnboardingUser {
  email: string;
  businessName?: string;
  highestRole?: string;
}

interface Props {
  user: OnboardingUser | null;
  onComplete: () => void;
}

const FEATURES = [
  {
    icon: "📦",
    title: "Inventory Counting",
    desc: "Weigh, count, and track every bottle and keg",
  },
  {
    icon: "💳",
    title: "POS Tracking",
    desc: "Sync sales to auto-deplete inventory levels",
  },
  {
    icon: "📊",
    title: "Variance Detection",
    desc: "Spot shrinkage, over-pours, and loss patterns",
  },
  {
    icon: "🔔",
    title: "Par & Reorder",
    desc: "Set par levels and get low-stock alerts",
  },
];

function getRoleLabel(role?: string) {
  switch (role) {
    case "platform_admin":
      return "Platform Admin";
    case "business_admin":
      return "Business Admin";
    case "manager":
      return "Manager";
    case "staff":
      return "Staff";
    default:
      return "Team Member";
  }
}

function getQuickStart(role?: string) {
  switch (role) {
    case "staff":
      return {
        title: "Ready to Count",
        desc: "Start by joining a counting session from the Count tab. Your manager will assign sub-areas for you to count.",
      };
    case "manager":
      return {
        title: "Set Up Your Bar",
        desc: "Start by adding your inventory items and tare weights. Then connect your POS to enable automatic depletion tracking.",
      };
    case "business_admin":
    case "platform_admin":
      return {
        title: "Configure Everything",
        desc: "Set up categories, connect your POS system, invite staff, and configure locations. Head to Settings to get started.",
      };
    default:
      return {
        title: "Get Started",
        desc: "Explore the app to see your inventory, start counting sessions, and track variance.",
      };
  }
}

export default function OnboardingOverlay({ user, onComplete }: Props) {
  const [page, setPage] = useState(0);
  const totalPages = 3;

  const roleLabel = getRoleLabel(user?.highestRole);
  const quickStart = getQuickStart(user?.highestRole);

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        {/* Skip link */}
        <TouchableOpacity style={styles.skipButton} onPress={onComplete}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        {/* Page content */}
        <View style={styles.pageContent}>
          {page === 0 && (
            <>
              <Text style={styles.welcomeTitle}>Welcome to Barstock!</Text>
              {user?.businessName ? (
                <Text style={styles.businessName}>{user.businessName}</Text>
              ) : null}
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{roleLabel}</Text>
              </View>
              <Text style={styles.welcomeDesc}>
                Your complete bar inventory management system. Track every bottle,
                monitor shrinkage, and make smarter ordering decisions.
              </Text>
            </>
          )}

          {page === 1 && (
            <>
              <Text style={styles.pageTitle}>Key Features</Text>
              <View style={styles.featureGrid}>
                {FEATURES.map((f) => (
                  <View key={f.title} style={styles.featureCard}>
                    <Text style={styles.featureIcon}>{f.icon}</Text>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureDesc}>{f.desc}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {page === 2 && (
            <>
              <Text style={styles.pageTitle}>{quickStart.title}</Text>
              <Text style={styles.quickStartDesc}>{quickStart.desc}</Text>
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{roleLabel}</Text>
              </View>
            </>
          )}
        </View>

        {/* Bottom section: dots + button */}
        <View style={styles.bottomSection}>
          <View style={styles.dots}>
            {Array.from({ length: totalPages }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === page && styles.dotActive]}
              />
            ))}
          </View>

          <TouchableOpacity
            style={styles.nextButton}
            onPress={() => {
              if (page < totalPages - 1) {
                setPage(page + 1);
              } else {
                onComplete();
              }
            }}
          >
            <Text style={styles.nextButtonText}>
              {page === totalPages - 1 ? "Get Started" : "Next"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B1623",
    zIndex: 100,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  skipButton: {
    alignSelf: "flex-end",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 14,
    color: "rgba(234, 240, 255, 0.5)",
  },
  pageContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#EAF0FF",
    textAlign: "center",
    marginBottom: 8,
  },
  businessName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#E9B44C",
    textAlign: "center",
    marginBottom: 12,
  },
  roleBadge: {
    backgroundColor: "rgba(233, 180, 76, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(233, 180, 76, 0.3)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 20,
  },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#E9B44C",
  },
  welcomeDesc: {
    fontSize: 15,
    color: "rgba(234, 240, 255, 0.6)",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#EAF0FF",
    textAlign: "center",
    marginBottom: 24,
  },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    maxWidth: SCREEN_WIDTH - 48,
  },
  featureCard: {
    backgroundColor: "#16283F",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1E3550",
    padding: 14,
    width: (SCREEN_WIDTH - 72) / 2,
    alignItems: "center",
  },
  featureIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#EAF0FF",
    textAlign: "center",
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 11,
    color: "rgba(234, 240, 255, 0.5)",
    textAlign: "center",
    lineHeight: 16,
  },
  quickStartDesc: {
    fontSize: 15,
    color: "rgba(234, 240, 255, 0.6)",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
    marginBottom: 16,
  },
  bottomSection: {
    alignItems: "center",
    gap: 20,
  },
  dots: {
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(234, 240, 255, 0.2)",
  },
  dotActive: {
    backgroundColor: "#E9B44C",
  },
  nextButton: {
    backgroundColor: "#E9B44C",
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 48,
    minWidth: 200,
    alignItems: "center",
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0B1623",
  },
});
