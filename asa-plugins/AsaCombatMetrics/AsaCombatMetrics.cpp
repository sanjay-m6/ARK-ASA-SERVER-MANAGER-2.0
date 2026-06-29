#include <string>
#include <thread>
#include <queue>
#include <mutex>
#include <condition_variable>
#include <chrono>
#include <sstream>
#include <iomanip>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <API/ARK/Ark.h>
#include <API/UE/Math/Color.h>

#pragma comment(lib, "Ws2_32.lib")

// Global variables
std::thread g_socketThread;
std::queue<std::string> g_eventQueue;
std::mutex g_queueMutex;
std::condition_variable g_queueCondition;
bool g_shouldShutdown = false;

// Winsock configuration
const char* MANAGER_IP = "127.0.0.1";
const int MANAGER_PORT = 30100;

// Thread function that handles TCP socket streaming to Server Manager
void SocketWorkerThread() {
    WSADATA wsaData;
    SOCKET connectSocket = INVALID_SOCKET;
    struct sockaddr_in clientService;

    // Initialize Winsock
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        Log::GetLog()->error("[AsaCombatMetrics] WSAStartup failed.");
        return;
    }

    clientService.sin_family = AF_INET;
    clientService.sin_addr.s_addr = inet_addr(MANAGER_IP);
    clientService.sin_port = htons(MANAGER_PORT);

    while (!g_shouldShutdown) {
        // Attempt connection to the Server Manager
        connectSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (connectSocket == INVALID_SOCKET) {
            std::this_thread::sleep_for(std::chrono::seconds(5));
            continue;
        }

        Log::GetLog()->info("[AsaCombatMetrics] Attempting to connect to Server Manager on {}:{}...", MANAGER_IP, MANAGER_PORT);
        if (connect(connectSocket, (SOCKADDR*)&clientService, sizeof(clientService)) == SOCKET_ERROR) {
            closesocket(connectSocket);
            connectSocket = INVALID_SOCKET;
            // Retry connection in 5 seconds
            std::this_thread::sleep_for(std::chrono::seconds(5));
            continue;
        }

        Log::GetLog()->info("[AsaCombatMetrics] Connected to Server Manager successfully!");

        // Process queue loop
        while (!g_shouldShutdown) {
            std::string payload;

            {
                std::unique_lock<std::mutex> lock(g_queueMutex);
                g_queueCondition.wait(lock, [] {
                    return !g_eventQueue.empty() || g_shouldShutdown;
                });

                if (g_shouldShutdown) break;

                payload = g_eventQueue.front();
                g_eventQueue.pop();
            }

            // Append newline as separator for the JSON parser on the backend
            payload += "\n";

            int bytesSent = send(connectSocket, payload.c_str(), static_cast<int>(payload.length()), 0);
            if (bytesSent == SOCKET_ERROR) {
                Log::GetLog()->error("[AsaCombatMetrics] Connection lost. Reconnecting...");
                closesocket(connectSocket);
                connectSocket = INVALID_SOCKET;
                break; // Exit inner loop to trigger reconnect
            }
        }

        if (connectSocket != INVALID_SOCKET) {
            closesocket(connectSocket);
            connectSocket = INVALID_SOCKET;
        }
    }

    WSACleanup();
}

// Queue helper
void QueueEvent(const std::string& jsonEvent) {
    std::lock_guard<std::mutex> lock(g_queueMutex);
    // Limit queue size to prevent out-of-memory under extreme combat loads
    if (g_eventQueue.size() < 1000) {
        g_eventQueue.push(jsonEvent);
        g_queueCondition.notify_one();
    }
}

// Helper to escape JSON strings safely
std::string EscapeJsonString(const std::string& input) {
    std::ostringstream ss;
    for (char c : input) {
        switch (c) {
            case '"': ss << "\\\""; break;
            case '\\': ss << "\\\\"; break;
            case '\b': ss << "\\b"; break;
            case '\f': ss << "\\f"; break;
            case '\n': ss << "\\n"; break;
            case '\r': ss << "\\r"; break;
            case '\t': ss << "\\t"; break;
            default:
                if ('\x00' <= c && c <= '\x1f') {
                    ss << "\\u" << std::hex << std::setw(4) << std::setfill('0') << static_cast<int>(c);
                } else {
                    ss << c;
                }
        }
    }
    return ss.str();
}

// Unreal Engine hook signature for TakeDamage
// float APrimalCharacter::TakeDamage(float Damage, FDamageEvent const& DamageEvent, AController* EventInstigator, AActor* DamageCauser)
DECLARE_HOOK(APrimalCharacter_TakeDamage, float, APrimalCharacter*, float, FDamageEvent*, AController*, AActor*);

float Hook_APrimalCharacter_TakeDamage(APrimalCharacter* _this, float Damage, FDamageEvent* DamageEvent, AController* EventInstigator, AActor* DamageCauser) {
    // Process damage natively first
    float actualDamage = APrimalCharacter_TakeDamage_original(_this, Damage, DamageEvent, EventInstigator, DamageCauser);

    if (actualDamage > 0.01f && DamageCauser != nullptr && _this != nullptr) {
        std::string attackerName = "Unknown";
        std::string attackerTribe = "None";
        std::string targetName = "Unknown";

        // Extract attacker info
        AShooterCharacter* shooterAttacker = Cast<AShooterCharacter>(DamageCauser);
        if (shooterAttacker) {
            attackerName = shooterAttacker->GetPlayerName().ToString();
            attackerTribe = shooterAttacker->GetTribeName().ToString();
        } else {
            // Check if damage causer is a tamed dinosaur
            APrimalDinoCharacter* dinoAttacker = Cast<APrimalDinoCharacter>(DamageCauser);
            if (dinoAttacker) {
                attackerName = dinoAttacker->ClassNameField().ToString();
                // If it is tamed, get owner's name/tribe
                if (dinoAttacker->IsTamed()) {
                    attackerTribe = dinoAttacker->GetTribeName().ToString();
                    std::string ownerName = dinoAttacker->GetTamedOwnerName().ToString();
                    if (!ownerName.empty()) {
                        attackerName += " (" + ownerName + ")";
                    }
                }
            } else {
                attackerName = DamageCauser->ClassNameField().ToString();
            }
        }

        // Extract target info
        APrimalDinoCharacter* dinoTarget = Cast<APrimalDinoCharacter>(_this);
        if (dinoTarget) {
            targetName = dinoTarget->ClassNameField().ToString();
            if (dinoTarget->IsTamed()) {
                std::string targetTribe = dinoTarget->GetTribeName().ToString();
                if (!targetTribe.empty()) {
                    targetName += " [Tribe: " + targetTribe + "]";
                }
            } else {
                targetName += " (Wild, Lvl " + std::to_string(dinoTarget->LevelField()) + ")";
            }
        } else {
            AShooterCharacter* playerTarget = Cast<AShooterCharacter>(_this);
            if (playerTarget) {
                targetName = playerTarget->GetPlayerName().ToString() + " [Player]";
            } else {
                targetName = _this->ClassNameField().ToString();
            }
        }

        // Format JSON payload
        std::ostringstream json;
        json << "{"
             << "\"event\":\"damage_event\","
             << "\"attacker\":\"" << EscapeJsonString(attackerName) << "\","
             << "\"tribe\":\"" << EscapeJsonString(attackerTribe) << "\","
             << "\"target\":\"" << EscapeJsonString(targetName) << "\","
             << "\"damage\":" << actualDamage << ","
             << "\"timestamp\":" << std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count()
             << "}";

        QueueEvent(json.str());
    }

    return actualDamage;
}

// Entrypoint called when the DLL is loaded
extern "C" __declspec(dllexport) void Plugin_Init() {
    Log::GetLog()->info("[AsaCombatMetrics] Initializing plugin...");

    // Start background socket worker thread
    g_shouldShutdown = false;
    g_socketThread = std::thread(SocketWorkerThread);

    // Bind Unreal Engine hooks
    ArkApi::GetHooks().SetHook("APrimalCharacter.TakeDamage", &Hook_APrimalCharacter_TakeDamage, &APrimalCharacter_TakeDamage_original);

    Log::GetLog()->info("[AsaCombatMetrics] Hook registered successfully!");
}

// Called when server stops or plugin is reloaded
extern "C" __declspec(dllexport) void Plugin_Unload() {
    Log::GetLog()->info("[AsaCombatMetrics] Unloading plugin...");

    // Remove hooks
    ArkApi::GetHooks().DisableHook("APrimalCharacter.TakeDamage", &Hook_APrimalCharacter_TakeDamage);

    // Shutdown background thread
    g_shouldShutdown = true;
    g_queueCondition.notify_all();
    if (g_socketThread.joinable()) {
        g_socketThread.join();
    }

    Log::GetLog()->info("[AsaCombatMetrics] Unloaded successfully.");
}
