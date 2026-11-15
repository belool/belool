#include "OZMapBuilder.h"
#include "OZShapes.h"
#include "OZTypes.h"
#include "OZBlock.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/SkyLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Components/SkyAtmosphereComponent.h"
#include "Components/VolumetricCloudComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/SkyLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/PostProcessVolume.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Engine/World.h"

// Os números abaixo vêm do mapa web (metros) e são convertidos para cm (x100).
static constexpr float M = 100.f;

AOZMapBuilder::AOZMapBuilder()
{
	PrimaryActorTick.bCanEverTick = false;
	RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
}

UInstancedStaticMeshComponent* AOZMapBuilder::Pool(FName Mat, const FLinearColor& Color)
{
	const FString Key = Mat.ToString() + Color.ToString();
	if (UInstancedStaticMeshComponent** Found = Pools.Find(Key)) return *Found;
	UInstancedStaticMeshComponent* C = NewObject<UInstancedStaticMeshComponent>(this);
	C->SetStaticMesh(OZShapes::Mesh(OZShapes::EShape::Cube));
	C->SetMobility(EComponentMobility::Movable);
	C->SetCollisionProfileName(TEXT("BlockAll"));
	C->ComponentTags.Add(Mat); // material para a penetração das balas
	C->SetupAttachment(RootComponent);
	if (UMaterialInstanceDynamic* Mtl = OZShapes::Material(C, Color)) C->SetMaterial(0, Mtl);
	C->RegisterComponent();
	Pools.Add(Key, C);
	return C;
}

void AOZMapBuilder::Box(const FVector& Center, const FVector& Size, FName Mat, const FLinearColor* Tint)
{
	Pool(Mat, Tint ? *Tint : OZMaterials::Color(Mat))->AddInstance(FTransform(FRotator::ZeroRotator, Center, Size / 100.f), true);
}

void AOZMapBuilder::Slab(float X0, float Y0, float X1, float Y1, float Z0, float Z1, FName Mat, const FLinearColor* Tint)
{
	const FVector Min(FMath::Min(X0, X1), FMath::Min(Y0, Y1), FMath::Min(Z0, Z1)), Max(FMath::Max(X0, X1), FMath::Max(Y0, Y1), FMath::Max(Z0, Z1));
	if ((Max - Min).GetMin() < 0.5f) return;
	Box((Min + Max) * 0.5f, Max - Min, Mat, Tint);
}

void AOZMapBuilder::Destructible(const FVector& Center, const FVector& Size, FName Mat, float Health, bool bExplosive, bool bExplosiveOnly, const FLinearColor* Tint)
{
	FActorSpawnParameters P; P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	if (AOZBlock* B = GetWorld()->SpawnActor<AOZBlock>(AOZBlock::StaticClass(), FTransform(Center), P))
		B->Setup(Size, Mat, Health, bExplosive, bExplosiveOnly, Tint);
}

// Parede alinhada a um eixo com aberturas (portas/janelas) medidas a partir do início.
void AOZMapBuilder::Wall(float X0, float Y0, float X1, float Y1, float Height, float Thick, FName Mat, const TArray<FOpening>& Openings, float Z0, bool bDestructible, const FLinearColor* Tint)
{
	const bool bAlongX = FMath::Abs(X1 - X0) >= FMath::Abs(Y1 - Y0);
	const float Len = bAlongX ? FMath::Abs(X1 - X0) : FMath::Abs(Y1 - Y0);
	const float SX = FMath::Min(X0, X1), SY = FMath::Min(Y0, Y1), Fixed = bAlongX ? Y0 : X0;
	auto Seg = [&](float A, float B, float ZA, float ZB, FName M2, bool bGlass) {
		if (B - A < 1.f || ZB - ZA < 1.f) return;
		const FVector Center = bAlongX ? FVector(SX + (A + B) * 0.5f, Fixed, Z0 + (ZA + ZB) * 0.5f) : FVector(Fixed, SY + (A + B) * 0.5f, Z0 + (ZA + ZB) * 0.5f);
		const FVector Size = bAlongX ? FVector(B - A, Thick, ZB - ZA) : FVector(Thick, B - A, ZB - ZA);
		if (bGlass) Destructible(Center, FVector(Size.X * (bAlongX ? 1.f : 0.3f), Size.Y * (bAlongX ? 0.3f : 1.f), Size.Z), "glass", 1.f);
		else if (bDestructible) Destructible(Center, Size, M2, 260.f, false, M2 != "wood", Tint);
		else Box(Center, Size, M2, Tint);
	};
	// paredes destrutíveis em módulos de 2 m (buracos localizados)
	auto Pieces = [&](float A, float B) {
		if (!bDestructible) { Seg(A, B, 0, Height, Mat, false); return; }
		const int32 N = FMath::Max(1, FMath::RoundToInt((B - A) / 200.f));
		for (int32 i = 0; i < N; i++) Seg(A + (B - A) * i / N, A + (B - A) * (i + 1) / N, 0, Height, Mat, false);
	};
	TArray<FOpening> Ops = Openings;
	Ops.Sort([](const FOpening& A, const FOpening& B) { return A.At < B.At; });
	float Cur = 0.f;
	for (const FOpening& O : Ops)
	{
		const float A = FMath::Max(0.f, O.At - O.Width * 0.5f), B = FMath::Min(Len, O.At + O.Width * 0.5f);
		Pieces(Cur, A);
		Seg(A, B, 0, O.Z0, Mat, false);
		Seg(A, B, O.Z1, Height, Mat, false);
		if (O.bGlass) Seg(A, B, O.Z0, O.Z1, Mat, true);
		Cur = B;
	}
	Pieces(Cur, Len);
}

// Prédio explorável: portas, janelas, andares, escada interna e telhado.
void AOZMapBuilder::Building(float CX, float CY, float W, float D, int32 Floors, FName Mat, const TArray<FString>& Doors, bool bDestructible, const FLinearColor* Tint, float FloorH)
{
	const float T = 30.f, X0 = CX - W / 2, X1 = CX + W / 2, Y0 = CY - D / 2, Y1 = CY + D / 2;
	struct FSide { FString K; float AX, AY, BX, BY, Len; };
	const FSide Sides[4] = { { TEXT("n"), X0, Y1, X1, Y1, W }, { TEXT("s"), X0, Y0, X1, Y0, W }, { TEXT("w"), X0, Y0, X0, Y1, D }, { TEXT("e"), X1, Y0, X1, Y1, D } };
	for (int32 F = 0; F < Floors; F++)
	{
		for (const FSide& S : Sides)
		{
			TArray<FOpening> Ops;
			int32 NDoors = 0;
			if (F == 0) for (const FString& Dd : Doors) if (Dd == S.K) NDoors++;
			TArray<float> DoorAt;
			for (int32 i = 0; i < NDoors; i++) { DoorAt.Add(S.Len * (i + 1) / (NDoors + 1)); Ops.Add({ DoorAt.Last(), 220.f, 0.f, 240.f, false }); }
			const int32 NWin = FMath::Max(1, (int32)(S.Len / 400.f));
			for (int32 i = 0; i < NWin; i++)
			{
				const float At = S.Len * (i + 0.5f) / NWin;
				bool bNearDoor = false; for (float Dd : DoorAt) if (FMath::Abs(Dd - At) < 240.f) bNearDoor = true;
				if (bNearDoor || At < 120.f || At > S.Len - 120.f) continue;
				Ops.Add({ At, 140.f, 100.f, 220.f, Mat != "sheetmetal" });
			}
			const bool bNS = S.K == TEXT("n") || S.K == TEXT("s");
			if (bNS) Wall(S.AX - T / 2, S.AY, S.BX + T / 2, S.BY, FloorH, T, Mat, Ops, F * FloorH, bDestructible, Tint);
			else Wall(S.AX, S.AY + T / 2, S.BX, S.BY - T / 2, FloorH, T, Mat, Ops, F * FloorH, bDestructible, Tint);
		}
		const float ZTop = (F + 1) * FloorH;
		if (F < Floors - 1)
		{
			// escada encostada na parede oeste, subindo em +Y, com vão na laje
			const float SW = 130.f, Run = 32.f; const int32 Steps = FMath::CeilToInt(FloorH / 25.f);
			const float SX0 = X0 + T / 2, SY0 = Y0 + 100.f;
			for (int32 i = 0; i < Steps; i++) Slab(SX0, SY0 + i * Run, SX0 + SW, SY0 + (i + 1) * Run, F * FloorH, F * FloorH + (i + 1) * (FloorH / Steps), "concrete");
			const float HoleY1 = SY0 + Steps * Run;
			Slab(X0, Y0, X1, SY0, ZTop - 25.f, ZTop, Mat, Tint);
			Slab(X0 + SW + T / 2, SY0, X1, HoleY1, ZTop - 25.f, ZTop, Mat, Tint);
			Slab(X0, HoleY1, X1, Y1, ZTop - 25.f, ZTop, Mat, Tint);
		}
		else
		{
			Slab(X0 - 20.f, Y0 - 20.f, X1 + 20.f, Y1 + 20.f, ZTop - 25.f, ZTop, Mat, Tint);
			if (Floors > 1) for (const FSide& S : Sides) Wall(S.AX, S.AY, S.BX, S.BY, 100.f, 25.f, Mat, {}, ZTop, false, Tint); // parapeito
		}
	}
	if (W > 600.f && D > 600.f) Destructible(FVector(CX, CY + D * 0.15f, 45.f), FVector(180.f, 90.f, 90.f), "wood", 80.f);
}

void AOZMapBuilder::Crate(float X, float Y, float S, int32 Stack)
{
	for (int32 i = 0; i < Stack; i++) Destructible(FVector(X, Y, S / 2 + i * S), FVector(S), "wood", 90.f);
}

void AOZMapBuilder::Barrel(float X, float Y)
{
	const FLinearColor Red(0.45f, 0.04f, 0.03f);
	Destructible(FVector(X, Y, 60.f), FVector(75.f, 75.f, 120.f), "metal", 40.f, true, false, &Red);
}

void AOZMapBuilder::Sandbags(float X0, float Y0, float X1, float Y1)
{
	if (FMath::Abs(X1 - X0) > FMath::Abs(Y1 - Y0)) Slab(X0, Y0 - 45.f, X1, Y0 + 45.f, 0.f, 110.f, "sandbag");
	else Slab(X0 - 45.f, Y0, X0 + 45.f, Y1, 0.f, 110.f, "sandbag");
}

void AOZMapBuilder::Container(float X, float Y, bool bAlongX, const FLinearColor& Tint, int32 Stack)
{
	for (int32 i = 0; i < Stack; i++)
		Box(FVector(X, Y, 130.f + i * 260.f), bAlongX ? FVector(610.f, 245.f, 260.f) : FVector(245.f, 610.f, 260.f), "sheetmetal", &Tint);
}

void AOZMapBuilder::Tank(float X, float Y, float Radius, float Height)
{
	UStaticMeshComponent* C = NewObject<UStaticMeshComponent>(this);
	C->SetStaticMesh(OZShapes::Mesh(OZShapes::EShape::Cylinder));
	C->SetMobility(EComponentMobility::Movable);
	C->SetCollisionProfileName(TEXT("BlockAll"));
	C->ComponentTags.Add("metal");
	C->SetupAttachment(RootComponent);
	C->SetWorldLocation(FVector(X, Y, Height / 2));
	C->SetWorldScale3D(FVector(Radius * 2.f / 100.f, Radius * 2.f / 100.f, Height / 100.f));
	if (UMaterialInstanceDynamic* Mtl = OZShapes::Material(C, FLinearColor(0.42f, 0.44f, 0.46f))) C->SetMaterial(0, Mtl);
	C->RegisterComponent();
}

void AOZMapBuilder::Tunnel(float X0, float Y, float X1)
{
	const float W = 340.f, H = 300.f;
	const FLinearColor Grey(0.17f, 0.17f, 0.16f);
	Slab(X0, Y - W / 2 - 50.f, X1, Y - W / 2, 0.f, H, "concrete", &Grey);
	Slab(X0, Y + W / 2, X1, Y + W / 2 + 50.f, 0.f, H, "concrete", &Grey);
	Slab(X0, Y - W / 2 - 50.f, X1, Y + W / 2 + 50.f, H, H + 50.f, "concrete", &Grey);
	// aterro por cima
	Slab(X0 + 100.f, Y - W / 2 - 600.f, X1 - 100.f, Y - W / 2 - 50.f, 0.f, H + 80.f, "dirt");
	Slab(X0 + 100.f, Y + W / 2 + 50.f, X1 - 100.f, Y + W / 2 + 600.f, 0.f, H + 80.f, "dirt");
	Slab(X0 + 100.f, Y - W / 2 - 50.f, X1 - 100.f, Y + W / 2 + 50.f, H + 50.f, H + 140.f, "dirt");
}

void AOZMapBuilder::Tower(float X, float Y, float H)
{
	const float S = 320.f;
	for (int32 DX = -1; DX <= 1; DX += 2) for (int32 DY = -1; DY <= 1; DY += 2) Box(FVector(X + DX * (S / 2 - 15.f), Y + DY * (S / 2 - 15.f), H / 2), FVector(30.f, 30.f, H), "metal");
	Slab(X - S / 2, Y - S / 2, X + S / 2, Y + S / 2, H, H + 20.f, "metal");
	Wall(X - S / 2, Y + S / 2, X + S / 2, Y + S / 2, 110.f, 12.f, "metal", {}, H + 20.f);
	Wall(X + S / 2, Y - S / 2, X + S / 2, Y + S / 2, 110.f, 12.f, "metal", {}, H + 20.f);
	Wall(X - S / 2, Y - S / 2, X - S / 2, Y + S / 2, 110.f, 12.f, "metal", {}, H + 20.f);
	Slab(X - S / 2 - 20.f, Y - S / 2 - 20.f, X + S / 2 + 20.f, Y + S / 2 + 20.f, H + 260.f, H + 280.f, "sheetmetal");
	// escada pelo lado sul
	const int32 Steps = FMath::CeilToInt(H / 30.f);
	for (int32 i = 0; i < Steps; i++) Slab(X - 60.f, Y - S / 2 - 50.f - (Steps - i) * 30.f, X + 60.f, Y - S / 2 - 50.f - (Steps - i - 1) * 30.f, 0.f, (i + 1) * (H / Steps), "metal");
	Slab(X - 60.f, Y - S / 2 - 50.f, X + 60.f, Y - S / 2 + 10.f, H - 1.f, H + 20.f, "metal");
}

// Céu físico, sol, luz ambiente em tempo real, neblina, nuvens e pós-processamento.
void AOZMapBuilder::Lighting()
{
	UWorld* W = GetWorld();
	FActorSpawnParameters P; P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	if (ADirectionalLight* Sun = W->SpawnActor<ADirectionalLight>(ADirectionalLight::StaticClass(), FTransform(FRotator(-38.f, 35.f, 0.f), FVector(0, 0, 1000)), P))
	{
		Sun->SetMobility(EComponentMobility::Movable);
		if (UDirectionalLightComponent* L = Cast<UDirectionalLightComponent>(Sun->GetLightComponent()))
		{
			L->SetIntensity(9.f);
			L->SetAtmosphereSunLight(true);
			L->SetDynamicShadowCascades(4);
		}
	}
	W->SpawnActor<ASkyAtmosphere>(ASkyAtmosphere::StaticClass(), FTransform::Identity, P);
	if (ASkyLight* Sky = W->SpawnActor<ASkyLight>(ASkyLight::StaticClass(), FTransform::Identity, P))
	{
		if (USkyLightComponent* SL = Sky->GetLightComponent())
		{
			SL->SetMobility(EComponentMobility::Movable);
			SL->bRealTimeCapture = true;
			SL->SetIntensity(1.f);
			SL->RecaptureSky();
		}
	}
	if (AExponentialHeightFog* Fog = W->SpawnActor<AExponentialHeightFog>(AExponentialHeightFog::StaticClass(), FTransform::Identity, P))
		if (UExponentialHeightFogComponent* FC = Fog->GetComponent()) { FC->SetFogDensity(0.012f); FC->SetFogHeightFalloff(0.08f); }
	W->SpawnActor<AVolumetricCloud>(AVolumetricCloud::StaticClass(), FTransform::Identity, P);
	if (APostProcessVolume* PP = W->SpawnActor<APostProcessVolume>(APostProcessVolume::StaticClass(), FTransform::Identity, P))
	{
		PP->bUnbound = true;
		FPostProcessSettings& S = PP->Settings;
		S.bOverride_BloomIntensity = true; S.BloomIntensity = 0.6f;
		S.bOverride_VignetteIntensity = true; S.VignetteIntensity = 0.35f;
		S.bOverride_FilmGrainIntensity = true; S.FilmGrainIntensity = 0.08f;
		S.bOverride_AutoExposureMinBrightness = true; S.AutoExposureMinBrightness = 0.6f;
		S.bOverride_AutoExposureMaxBrightness = true; S.AutoExposureMaxBrightness = 2.f;
		S.bOverride_ColorSaturation = true; S.ColorSaturation = FVector4(1.08f, 1.08f, 1.08f, 1.f);
		S.bOverride_SceneFringeIntensity = true; S.SceneFringeIntensity = 0.4f;
	}
}

FOZMapLayout AOZMapBuilder::BuildRefinery(UWorld* World)
{
	FOZMapLayout L;
	FActorSpawnParameters P; P.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AOZMapBuilder* B = World->SpawnActor<AOZMapBuilder>(AOZMapBuilder::StaticClass(), FTransform::Identity, P);
	if (!B) return L;
	const float S = 85.f * M;
	B->Lighting();
	// chão (asfalto) e perímetro
	const FLinearColor Asphalt(0.06f, 0.06f, 0.058f), WallTint(0.2f, 0.2f, 0.19f);
	B->Box(FVector(0, 0, -50.f), FVector(S * 6.f, S * 6.f, 100.f), "concrete", &Asphalt);
	B->Wall(-S, -S, S, -S, 500.f, 100.f, "concrete", {}, 0.f, false, &WallTint);
	B->Wall(-S, S, S, S, 500.f, 100.f, "concrete", {}, 0.f, false, &WallTint);
	B->Wall(-S, -S, -S, S, 500.f, 100.f, "concrete", {}, 0.f, false, &WallTint);
	B->Wall(S, -S, S, S, 500.f, 100.f, "concrete", {}, 0.f, false, &WallTint);
	// tanques e dutos
	for (const FVector2D& T : { FVector2D(-18, -14), FVector2D(18, -14), FVector2D(-18, 18), FVector2D(18, 18) }) B->Tank(T.X * M, T.Y * M, 5.5f * M, 9.f * M);
	B->Slab(-12 * M, -14 * M - 60, 12 * M, -14 * M + 60, 340, 460, "metal");
	B->Slab(-12 * M, 18 * M - 60, 12 * M, 18 * M + 60, 440, 560, "metal");
	// armazéns, escritórios de 2 andares
	const FLinearColor Ware1(0.17f, 0.21f, 0.24f), Ware2(0.24f, 0.17f, 0.16f);
	B->Building(-52 * M, -35 * M, 26 * M, 16 * M, 1, "sheetmetal", { TEXT("n"), TEXT("s"), TEXT("e"), TEXT("w") }, false, &Ware1, 700.f);
	B->Building(52 * M, 38 * M, 26 * M, 16 * M, 1, "sheetmetal", { TEXT("n"), TEXT("s"), TEXT("e"), TEXT("w") }, false, &Ware2, 700.f);
	B->Building(0, 58 * M, 16 * M, 12 * M, 2, "brick", { TEXT("s"), TEXT("e") }, true);
	B->Building(0, -58 * M, 16 * M, 12 * M, 2, "brick", { TEXT("n"), TEXT("w") }, true);
	// contêineres
	const FLinearColor CT[4] = { FLinearColor(0.32f, 0.06f, 0.04f), FLinearColor(0.04f, 0.14f, 0.32f), FLinearColor(0.06f, 0.24f, 0.06f), FLinearColor(0.4f, 0.27f, 0.04f) };
	for (int32 i = 0; i < 4; i++) B->Container(-48 * M, (30 + i * 7) * M, true, CT[i], i % 2 + 1);
	for (int32 i = 0; i < 4; i++) B->Container(48 * M, (-28 - i * 7) * M, true, CT[3 - i], (i + 1) % 2 + 1);
	B->Container(-30 * M, 52 * M, false, FLinearColor(0.12f, 0.12f, 0.12f), 2);
	B->Container(30 * M, -52 * M, false, FLinearColor(0.12f, 0.12f, 0.12f), 2);
	// túneis de dutos
	B->Tunnel(-78 * M, 0, -38 * M);
	B->Tunnel(38 * M, 0, 78 * M);
	// coberturas, caixas, barris, torres
	for (const FVector2D& T : { FVector2D(-6, 0), FVector2D(6, 2), FVector2D(0, -32), FVector2D(-3, 34), FVector2D(30, 10), FVector2D(-30, -8), FVector2D(60, -60), FVector2D(-60, 60) }) B->Barrel(T.X * M, T.Y * M);
	for (const FVector2D& T : { FVector2D(-10, 5), FVector2D(10, -5), FVector2D(-35, 15), FVector2D(35, -15), FVector2D(-25, -50), FVector2D(25, 50), FVector2D(65, 10), FVector2D(-65, -12) }) B->Crate(T.X * M, T.Y * M, 130.f, 1 + FMath::RandRange(0, 1));
	B->Sandbags(-8 * M, -30 * M, 8 * M, -30 * M);
	B->Sandbags(-8 * M, 30 * M, 8 * M, 30 * M);
	B->Tower(-70 * M, -70 * M, 600.f);
	B->Tower(70 * M, 70 * M, 600.f);
	// spawns e pontos estratégicos
	for (int32 i = 0; i < 6; i++) { L.Spawns[0].Add(FVector((-30 + i * 12) * M, -76 * M, 100.f)); L.Spawns[1].Add(FVector((-30 + i * 12) * M, 76 * M, 100.f)); }
	L.Points = { FVector(-55 * M, 5 * M, 0), FVector(0, 2 * M, 0), FVector(55 * M, -5 * M, 0) };
	return L;
}
