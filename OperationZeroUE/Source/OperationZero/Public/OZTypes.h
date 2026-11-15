#pragma once

#include "CoreMinimal.h"
#include "OZTypes.generated.h"

// ================================================================
// Tipos compartilhados: arsenal (orientado a dados), regiões de dano
// e materiais de penetração. Unidades: centímetros (padrão do Unreal).
// ================================================================

UENUM(BlueprintType)
enum class EOZWeaponClass : uint8 { Pistol, AssaultRifle, SMG, Sniper, DMR, Shotgun, LMG, Melee };

UENUM(BlueprintType)
enum class EOZFireMode : uint8 { Auto, Burst, Semi, Bolt, Pump, Melee };

UENUM(BlueprintType)
enum class EOZHitRegion : uint8 { Head, Chest, Stomach, Leg };

USTRUCT(BlueprintType)
struct FOZWeaponStats
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "OZ") FName Id;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") FString DisplayName;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") EOZWeaponClass Class = EOZWeaponClass::AssaultRifle;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float Damage = 30.f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float RPM = 600.f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") EOZFireMode Mode = EOZFireMode::Auto;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") int32 Mag = 30;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") int32 Reserve = 120;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float ReloadTime = 2.f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float ReloadEmptyTime = 2.5f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") bool bReloadPerShell = false;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float Velocity = 80000.f;      // cm/s
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float Range = 4500.f;          // cm com dano total
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float MinDamageMul = 0.7f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float Penetration = 22.f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") int32 Pellets = 1;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float HeadMul = 2.f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float SpreadHip = 3.f;         // graus
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float SpreadAds = 0.3f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float SpreadMove = 2.f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float RecoilVert = 0.8f;       // graus por tiro
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float RecoilHoriz = 0.4f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float RecoilRecovery = 12.f;   // graus/s
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float AdsZoom = 1.35f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float AdsTime = 0.22f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float MoveMul = 0.92f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float Length = 72.f;           // comprimento visual (cm)
	UPROPERTY(BlueprintReadOnly, Category = "OZ") FLinearColor Color = FLinearColor(0.03f, 0.035f, 0.04f);
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float SoundPitch = 1.f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") float SoundPower = 1.f;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") bool bScope = false;

	float FireInterval() const { return 60.f / FMath::Max(1.f, RPM); }
	bool IsMelee() const { return Mode == EOZFireMode::Melee; }
};

// Estado de uma arma em uso (munição, recarga, cadência).
USTRUCT(BlueprintType)
struct FOZWeaponState
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "OZ") FOZWeaponStats Stats;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") int32 InMag = 0;
	UPROPERTY(BlueprintReadOnly, Category = "OZ") int32 InReserve = 0;
	float Cooldown = 0.f;
	float Reloading = 0.f;
	float ReloadTotal = 0.f;
	float Bloom = 0.f;
	float BoltTime = 0.f;
	int32 BurstLeft = 0;
	EOZFireMode CurrentMode = EOZFireMode::Auto;

	void Init(const FOZWeaponStats& In) { Stats = In; InMag = In.Mag; InReserve = In.Reserve; CurrentMode = In.Mode; }
	bool CanFire() const { return Stats.IsMelee() ? Cooldown <= 0.f : (Cooldown <= 0.f && Reloading <= 0.f && InMag > 0 && BoltTime <= 0.f); }
	bool StartReload();
	// Retorna true quando um ciclo de recarga termina.
	bool Tick(float Dt);
	void Consume();
};

namespace OZWeapons
{
	OPERATIONZERO_API const FOZWeaponStats& Get(FName Id);
	OPERATIONZERO_API TArray<FName> All();
	// Queda de dano com a distância (cm).
	OPERATIONZERO_API float DamageAtRange(const FOZWeaponStats& S, float DistCm);
	OPERATIONZERO_API float RegionMultiplier(const FOZWeaponStats& S, EOZHitRegion R);
}

namespace OZMaterials
{
	// Custo de penetração por centímetro (densidade) e cor base do material.
	OPERATIONZERO_API float Density(FName Mat);
	OPERATIONZERO_API FLinearColor Color(FName Mat);
}
