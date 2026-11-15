#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "OZMapBuilder.generated.h"

class UInstancedStaticMeshComponent;

struct FOZMapLayout
{
	TArray<FVector> Spawns[2];
	TArray<FVector> Points;
};

// ================================================================
// Constrói o mapa em tempo de execução (porte da Refinaria Vulcano):
// geometria estática em instâncias por material (com colisão e tag de
// penetração), prédios com portas/janelas/escadas, túneis, objetos
// destrutíveis, iluminação com céu físico, neblina e pós-processamento.
// ================================================================
UCLASS()
class OPERATIONZERO_API AOZMapBuilder : public AActor
{
	GENERATED_BODY()

public:
	AOZMapBuilder();
	static FOZMapLayout BuildRefinery(UWorld* World);

	// primitivas de level design (cm)
	void Box(const FVector& Center, const FVector& Size, FName Mat, const FLinearColor* Tint = nullptr);
	void Slab(float X0, float Y0, float X1, float Y1, float Z0, float Z1, FName Mat, const FLinearColor* Tint = nullptr);
	void Destructible(const FVector& Center, const FVector& Size, FName Mat, float Health, bool bExplosive = false, bool bExplosiveOnly = false, const FLinearColor* Tint = nullptr);
	struct FOpening { float At; float Width; float Z0; float Z1; bool bGlass; };
	void Wall(float X0, float Y0, float X1, float Y1, float Height, float Thick, FName Mat, const TArray<FOpening>& Openings, float Z0 = 0.f, bool bDestructible = false, const FLinearColor* Tint = nullptr);
	void Building(float CX, float CY, float W, float D, int32 Floors, FName Mat, const TArray<FString>& Doors, bool bDestructible, const FLinearColor* Tint = nullptr, float FloorH = 340.f);
	void Crate(float X, float Y, float S = 120.f, int32 Stack = 1);
	void Barrel(float X, float Y);
	void Sandbags(float X0, float Y0, float X1, float Y1);
	void Container(float X, float Y, bool bAlongX, const FLinearColor& Tint, int32 Stack = 1);
	void Tank(float X, float Y, float Radius, float Height);
	void Tunnel(float X0, float Y, float X1);
	void Tower(float X, float Y, float H);
	void Lighting();

protected:
	UInstancedStaticMeshComponent* Pool(FName Mat, const FLinearColor& Color);
	UPROPERTY() TMap<FString, UInstancedStaticMeshComponent*> Pools;
};
