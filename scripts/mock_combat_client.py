import socket
import json
import time
import random

SERVER_IP = "127.0.0.1"
SERVER_PORT = 30100

players = [
    {"name": "Sanjay", "tribe": "DeepMind"},
    {"name": "Alice", "tribe": "AlphaTribe"},
    {"name": "Bob", "tribe": "SoloBob"},
    {"name": "RexRider", "tribe": "DeepMind"},
]

dinos = [
    "Carcharodontosaurus",
    "Rex (Level 280)",
    "Therizinosaurus",
    "Giganotosaurus",
    "Shadowmane",
    "Yutyrannus"
]

targets = [
    "Broodmother Lysrix (Beta)",
    "Megapithecus (Alpha)",
    "Dragon (Gamma)",
    "Wild Alpha Carno (Lvl 150)",
    "Wild Giganotosaurus (Lvl 90)",
    "Tamed Stegosaurus [Tribe: RivalTribe]",
    "Metal Gate [Tribe: RivalTribe]"
]

def simulate_combat():
    print(f"Connecting to Server Manager TCP listener at {SERVER_IP}:{SERVER_PORT}...")
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((SERVER_IP, SERVER_PORT))
        print("Connected successfully! Starting combat simulation (Ctrl+C to stop)...")
        
        while True:
            # Pick random stats
            attacker = random.choice(players)
            # 70% chance to be riding a dino
            if random.random() < 0.7:
                dino_ride = random.choice(dinos)
                attacker_str = f"{dino_ride} ({attacker['name']})"
            else:
                attacker_str = attacker['name']
                
            target_str = random.choice(targets)
            
            # Base damage or occasionally a massive critical hit
            is_crit = random.random() < 0.15
            if is_crit:
                damage = random.randint(10000, 25000)
            else:
                damage = random.randint(150, 4500)
                
            payload = {
                "event": "damage_event",
                "attacker": attacker_str,
                "tribe": attacker["tribe"],
                "target": target_str,
                "damage": damage,
                "timestamp": int(time.time() * 1000)
            }
            
            # Format and send
            json_str = json.dumps(payload) + "\n"
            s.sendall(json_str.encode('utf-8'))
            print(f"Sent: {attacker_str} dealt {damage} to {target_str}")
            
            # Tick interval
            time.sleep(random.uniform(0.5, 2.0))
            
    except ConnectionRefusedError:
        print("Error: Connection refused. Is the Server Manager application running?")
    except KeyboardInterrupt:
        print("\nStopping simulation.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        s.close()

if __name__ == "__main__":
    simulate_combat()
