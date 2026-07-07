#include <string>
#include <thread>
#include <chrono>
#include <mutex>
#include <vector>
#include <fstream>
#include <sstream>
#include <algorithm>
#include <mysql.h>
#include <json.hpp>
#include <API/ARK/Ark.h>

#pragma comment(lib, "libmysql.lib")

// Global configuration struct
struct PluginConfig {
  std::string db_host = "localhost";
  std::string db_user = "root";
  std::string db_pass = "";
  std::string db_name = "test";
  int db_port = 3306;
  float fetch_interval = 0.25f;
  std::string server_key = "Server1";
};

PluginConfig g_config;
bool g_shouldShutdown = false;
std::thread g_workerThread;
int g_lastFetchedId = 0;

// Load config from json file
void LoadConfig() {
  std::string config_path = ArkApi::Tools::GetCurrentDir() +
                            "/ArkApi/Plugins/AsaCrossChat/config.json";
  std::ifstream file(config_path);
  if (file.is_open()) {
    try {
      nlohmann::json j;
      file >> j;
      file.close();

      if (j.contains("MySQL")) {
        auto mysql = j["MySQL"];
        g_config.db_host = mysql.value("Host", "localhost");
        g_config.db_user = mysql.value("User", "root");
        g_config.db_pass = mysql.value("Password", "");
        g_config.db_name = mysql.value("Database", "test");
        g_config.db_port = mysql.value("Port", 3306);
      }
      if (j.contains("General")) {
        g_config.fetch_interval =
            j["General"].value("FetchChatInterval", 0.25f);
      }
      g_config.server_key = j.value("ServerKey", "Server1");
      Log::GetLog()->info("[AsaCrossChat] Loaded configuration successfully.");
    } catch (const std::exception &e) {
      Log::GetLog()->error("[AsaCrossChat] Failed to parse config file: {}",
                           e.what());
    }
  } else {
    Log::GetLog()->warn("[AsaCrossChat] Configuration file not found at: {}",
                        config_path);
  }
}

// SQL String Escaping Helper
std::string EscapeSqlString(MYSQL *conn, const std::string &input) {
  if (!conn)
    return input;
  std::vector<char> buffer(input.length() * 2 + 1);
  unsigned long length =
      mysql_real_escape_string(conn, buffer.data(), input.c_str(),
                               static_cast<unsigned long>(input.length()));
  return std::string(buffer.data(), length);
}

// Helper to read last fetched ID from file
int ReadLastFetchedId() {
  std::string path = ArkApi::Tools::GetCurrentDir() + "/ArkApi/Plugins/AsaCrossChat/last_fetched_id.txt";
  std::ifstream file(path);
  if (file.is_open()) {
    int id = 0;
    if (file >> id) {
      return id;
    }
  }
  return 0;
}

// Helper to write last fetched ID to file
void WriteLastFetchedId(int id) {
  std::string path = ArkApi::Tools::GetCurrentDir() + "/ArkApi/Plugins/AsaCrossChat/last_fetched_id.txt";
  std::ofstream file(path);
  if (file.is_open()) {
    file << id;
  }
}

// Polling background worker thread
void DatabaseWorker() {
  std::this_thread::sleep_for(std::chrono::seconds(5));

  MYSQL *conn = mysql_init(nullptr);
  if (!conn) {
    Log::GetLog()->error("[AsaCrossChat] Failed to initialize MySQL client.");
    return;
  }

  if (mysql_real_connect(conn, g_config.db_host.c_str(),
                         g_config.db_user.c_str(), g_config.db_pass.c_str(),
                         g_config.db_name.c_str(), g_config.db_port, nullptr,
                         0)) {
    Log::GetLog()->info(
        "[AsaCrossChat] Connected to database. Ensuring tables exist...");
    mysql_query(conn, "CREATE TABLE IF NOT EXISTS crosschat_messages ("
                      "id INT AUTO_INCREMENT PRIMARY KEY,"
                      "server_key VARCHAR(64) NOT NULL,"
                      "player_name VARCHAR(128) NOT NULL,"
                      "tribe_name VARCHAR(128) NOT NULL,"
                      "message TEXT NOT NULL,"
                      "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
                      ")");

    int file_id = ReadLastFetchedId();
    if (file_id > 0) {
      g_lastFetchedId = file_id;
      Log::GetLog()->info("[AsaCrossChat] Loaded last fetched ID from file: {}", g_lastFetchedId);
    } else {
      if (mysql_query(conn, "SELECT MAX(id) FROM crosschat_messages") == 0) {
        MYSQL_RES *res = mysql_store_result(conn);
        if (res) {
          MYSQL_ROW row = mysql_fetch_row(res);
          if (row && row[0]) {
            g_lastFetchedId = std::stoi(row[0]);
            Log::GetLog()->info("[AsaCrossChat] Initialized last fetched ID to DB MAX(id): {}", g_lastFetchedId);
          }
          mysql_free_result(res);
        }
      }
    }
  } else {
    Log::GetLog()->error(
        "[AsaCrossChat] Database connection failed during startup setup: {}",
        mysql_error(conn));
  }
  mysql_close(conn);

  while (!g_shouldShutdown) {
    std::this_thread::sleep_for(std::chrono::milliseconds(
        static_cast<int>(g_config.fetch_interval * 1000)));

    if (g_shouldShutdown)
      break;

    // Do not poll database or broadcast until game world is loaded and ready
    if (ArkApi::GetApiUtils().GetWorld() == nullptr) {
      continue;
    }

    MYSQL *conn = mysql_init(nullptr);
    if (conn) {
      if (mysql_real_connect(conn, g_config.db_host.c_str(),
                             g_config.db_user.c_str(), g_config.db_pass.c_str(),
                             g_config.db_name.c_str(), g_config.db_port,
                             nullptr, 0)) {
        std::string query = "SELECT id, server_key, player_name, tribe_name, "
                            "message FROM crosschat_messages WHERE id > " +
                            std::to_string(g_lastFetchedId) +
                            " AND server_key != '" + g_config.server_key +
                            "' ORDER BY id ASC";

        if (mysql_query(conn, query.c_str()) == 0) {
          MYSQL_RES *res = mysql_store_result(conn);
          if (res) {
            MYSQL_ROW row;
            bool got_new = false;
            while ((row = mysql_fetch_row(res))) {
              int msg_id = std::stoi(row[0]);
              std::string server_key = row[1];
              std::string sender = row[2];
              std::string tribe = row[3];
              std::string message = row[4];

              g_lastFetchedId = std::max(g_lastFetchedId, msg_id);
              got_new = true;

              std::wstring display_ws =
                  L"[" + std::wstring(server_key.begin(), server_key.end()) +
                  L"] " + std::wstring(sender.begin(), sender.end()) + L": " +
                  std::wstring(message.begin(), message.end());

              FString sender_fstr(L"CrossChat");
              FString message_fstr(display_ws.c_str());

              ArkApi::GetApiUtils().SendChatMessageToAll(sender_fstr,
                                                         message_fstr.c_str());
            }
            mysql_free_result(res);

            if (got_new) {
              WriteLastFetchedId(g_lastFetchedId);
            }
          }
        }
      }
      mysql_close(conn);
    }
  }
}

// In-game Chat Interception Callback
void OnChatMessage(AShooterPlayerController *player_controller,
                   FString *message, EChatSendMode::Type mode) {
  if (player_controller && message && mode == EChatSendMode::Global) {
    std::string sender = player_controller->GetPlayerName().ToString();
    std::string tribe = "None";

    AShooterCharacter *character = player_controller->GetPlayerCharacter();
    if (character) {
      tribe = character->GetTribeName().ToString();
    }

    std::string msg = message->ToString();

    if (!msg.empty() && msg[0] != '/') {
      std::thread([sender, tribe, msg]() {
        MYSQL *conn = mysql_init(nullptr);
        if (conn) {
          if (mysql_real_connect(
                  conn, g_config.db_host.c_str(), g_config.db_user.c_str(),
                  g_config.db_pass.c_str(), g_config.db_name.c_str(),
                  g_config.db_port, nullptr, 0)) {
            std::string escaped_sender = EscapeSqlString(conn, sender);
            std::string escaped_tribe = EscapeSqlString(conn, tribe);
            std::string escaped_msg = EscapeSqlString(conn, msg);

            std::string query = "INSERT INTO crosschat_messages (server_key, "
                                "player_name, tribe_name, message) VALUES ('" +
                                g_config.server_key + "', '" + escaped_sender +
                                "', '" + escaped_tribe + "', '" + escaped_msg +
                                "')";
            mysql_query(conn, query.c_str());
          }
          mysql_close(conn);
        }
      }).detach();
    }
  }
}

// Entrypoint called when DLL loaded
extern "C" __declspec(dllexport) void Plugin_Init() {
  Log::GetLog()->info("[AsaCrossChat] Initializing plugin...");

  LoadConfig();

  g_shouldShutdown = false;
  g_workerThread = std::thread(DatabaseWorker);

  // Register Chat Message Callback
  ArkApi::GetCommands().AddOnChatMessageCallback("AsaCrossChat",
                                                 &OnChatMessage);

  Log::GetLog()->info("[AsaCrossChat] Chat callback registered successfully!");
}

// Entrypoint called when DLL unloaded
extern "C" __declspec(dllexport) void Plugin_Unload() {
  Log::GetLog()->info("[AsaCrossChat] Unloading plugin...");

  // Remove Chat Message Callback
  ArkApi::GetCommands().RemoveOnChatMessageCallback("AsaCrossChat");

  g_shouldShutdown = true;
  if (g_workerThread.joinable()) {
    g_workerThread.join();
  }

  Log::GetLog()->info("[AsaCrossChat] Unloaded successfully.");
}
