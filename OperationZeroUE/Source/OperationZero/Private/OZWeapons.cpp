#include "OZTypes.h"

// Mesmos valores do protótipo web (velocidade/alcance convertidos para cm).
static TMap<FName, FOZWeaponStats> BuildTable()
{
	TMap<FName, FOZWeaponStats> T;
	auto Add = [&T](FName Id, const TCHAR* Name, EOZWeaponClass C, float Dmg, float Rpm, EOZFireMode M, int32 Mag, int32 Res,
		float Rl, float RlE, float VelMs, float RangeM, float MinMul, float Pen, int32 Pellets, float HeadMul,
		float SHip, float SAds, float SMove, float RV, float RH, float RRec, float Zoom, float AdsT, float MoveMul, float Len,
		FLinearColor Col, float Pitch, float Power)
	{
		FOZWeaponStats S;
		S.Id = Id; S.DisplayName = Name; S.Class = C; S.Damage = Dmg; S.RPM = Rpm; S.Mode = M; S.Mag = Mag; S.Reserve = Res;
		S.ReloadTime = Rl; S.ReloadEmptyTime = RlE; S.Velocity = VelMs * 100.f; S.Range = RangeM * 100.f; S.MinDamageMul = MinMul;
		S.Penetration = Pen; S.Pellets = Pellets; S.HeadMul = HeadMul; S.SpreadHip = SHip; S.SpreadAds = SAds; S.SpreadMove = SMove;
		S.RecoilVert = RV; S.RecoilHoriz = RH; S.RecoilRecovery = RRec; S.AdsZoom = Zoom; S.AdsTime = AdsT; S.MoveMul = MoveMul;
		S.Length = Len; S.Color = Col; S.SoundPitch = Pitch; S.SoundPower = Power;
		S.bReloadPerShell = (C == EOZWeaponClass::Shotgun);
		S.bScope = Zoom >= 3.f;
		T.Add(Id, S);
	};
	const FLinearColor Dark(0.03f, 0.035f, 0.04f), Wood(0.18f, 0.09f, 0.04f), Olive(0.09f, 0.11f, 0.06f), Tan(0.25f, 0.2f, 0.12f);
	//   id         nome                   classe                         dano  rpm  modo                pente res  recarga vel  alc  min   pen pel head  hip   ads   mov   rv   rh   rec  zoom adsT mov   comp cor   pitch pot
	Add("knife",   TEXT("Faca de combate"),    EOZWeaponClass::Melee,       55, 100, EOZFireMode::Melee, 0,   0,   0,   0,   0,   2.2f, 1,  0,  1,  2.f,  0,    0,    0,    0,   0,   10,  1,   0.1f, 1.08f, 25, Dark, 1.f, 0.2f);
	Add("p9",      TEXT("P-9 Sentinela"),      EOZWeaponClass::Pistol,      26, 400, EOZFireMode::Semi,  15,  60,  1.4f, 1.8f, 360, 18,  0.6f, 9,  1, 2.2f, 1.6f, 0.4f, 1.2f, 1.6f, 0.5f, 22, 1.2f, 0.12f, 1.f,  20, Dark, 1.4f, 0.55f);
	Add("r45",     TEXT("Raptor .45"),         EOZWeaponClass::Pistol,      48, 160, EOZFireMode::Semi,  7,   35,  1.9f, 2.3f, 420, 25,  0.6f, 14, 1, 2.2f, 2.2f, 0.35f, 1.6f, 4.2f, 1.2f, 18, 1.25f, 0.15f, 0.98f, 26, Tan, 1.1f, 0.75f);
	Add("ar4",     TEXT("AR-4 Vanguarda"),     EOZWeaponClass::AssaultRifle,30, 780, EOZFireMode::Auto,  30,  150, 2.1f, 2.6f, 880, 45,  0.72f, 22, 1, 2.f,  3.f,  0.25f, 2.2f, 0.85f, 0.45f, 12, 1.35f, 0.22f, 0.92f, 72, Dark, 1.2f, 0.6f);
	Add("kr47",    TEXT("KR-47 Tempestade"),   EOZWeaponClass::AssaultRifle,37, 610, EOZFireMode::Auto,  30,  150, 2.4f, 2.9f, 715, 40,  0.7f, 26, 1, 2.f,  3.3f, 0.35f, 2.4f, 1.25f, 0.75f, 10, 1.35f, 0.25f, 0.9f,  78, Wood, 1.0f, 0.7f);
	Add("vespa",   TEXT("Vespa SMG"),          EOZWeaponClass::SMG,         22, 950, EOZFireMode::Auto,  32,  192, 1.8f, 2.2f, 400, 16,  0.55f, 10, 1, 1.8f, 2.2f, 0.6f, 1.f,  0.55f, 0.55f, 16, 1.25f, 0.15f, 1.f,  50, Dark, 1.5f, 0.5f);
	Add("mpx9",    TEXT("MPX-9 Fantasma"),     EOZWeaponClass::SMG,         25, 820, EOZFireMode::Auto,  30,  180, 1.9f, 2.3f, 420, 20,  0.6f, 11, 1, 1.8f, 2.4f, 0.45f, 1.1f, 0.65f, 0.4f, 15, 1.3f, 0.17f, 0.99f, 55, Olive, 1.4f, 0.5f);
	Add("breacher",TEXT("Breacher 12"),        EOZWeaponClass::Shotgun,     17, 70,  EOZFireMode::Pump,  8,   32,  0.55f,0.55f, 380, 9,   0.25f, 6, 9, 1.5f, 6.5f, 4.8f, 1.f,  6.f,  1.5f, 12, 1.15f, 0.2f, 0.95f, 85, Wood, 0.7f, 0.95f);
	Add("longbow", TEXT("Longbow .338"),       EOZWeaponClass::Sniper,      115,45,  EOZFireMode::Bolt,  5,   25,  3.f,  3.6f, 940, 150, 0.85f, 45, 1, 2.5f, 7.f,  0.02f, 4.f,  7.f,  1.2f, 8,  6.f,  0.38f, 0.85f, 110, Olive, 0.6f, 1.f);
	Add("dmr14",   TEXT("DMR-14 Ceifador"),    EOZWeaponClass::DMR,         58, 300, EOZFireMode::Semi,  15,  75,  2.4f, 2.9f, 850, 80,  0.8f, 32, 1, 2.2f, 4.f,  0.1f, 2.5f, 2.6f, 0.8f, 10, 3.f,  0.3f, 0.88f, 95, Tan, 0.8f, 0.85f);
	Add("titan",   TEXT("Titan M-60"),         EOZWeaponClass::LMG,         34, 650, EOZFireMode::Auto,  100, 200, 5.f,  5.5f, 850, 55,  0.75f, 34, 1, 1.8f, 4.5f, 0.5f, 3.5f, 0.9f, 0.85f, 9,  1.4f, 0.4f, 0.78f, 100, Dark, 0.9f, 0.8f);
	return T;
}

static const TMap<FName, FOZWeaponStats>& Table()
{
	static TMap<FName, FOZWeaponStats> T = BuildTable();
	return T;
}

const FOZWeaponStats& OZWeapons::Get(FName Id)
{
	const FOZWeaponStats* S = Table().Find(Id);
	return S ? *S : *Table().Find(FName("ar4"));
}

TArray<FName> OZWeapons::All()
{
	TArray<FName> Out;
	Table().GetKeys(Out);
	return Out;
}

float OZWeapons::DamageAtRange(const FOZWeaponStats& S, float DistCm)
{
	if (DistCm <= S.Range) return S.Damage;
	const float T = FMath::Min(1.f, (DistCm - S.Range) / (S.Range * 1.5f));
	return S.Damage * (1.f - T * (1.f - S.MinDamageMul));
}

float OZWeapons::RegionMultiplier(const FOZWeaponStats& S, EOZHitRegion R)
{
	switch (R)
	{
	case EOZHitRegion::Head: return S.HeadMul;
	case EOZHitRegion::Stomach: return 0.9f;
	case EOZHitRegion::Leg: return 0.65f;
	default: return 1.f;
	}
}

bool FOZWeaponState::StartReload()
{
	if (Stats.IsMelee() || Reloading > 0.f || InMag >= Stats.Mag || InReserve <= 0) return false;
	ReloadTotal = Stats.bReloadPerShell ? Stats.ReloadTime : (InMag == 0 ? Stats.ReloadEmptyTime : Stats.ReloadTime);
	Reloading = ReloadTotal;
	BurstLeft = 0;
	return true;
}

bool FOZWeaponState::Tick(float Dt)
{
	Cooldown -= Dt;
	BoltTime = FMath::Max(0.f, BoltTime - Dt);
	Bloom = FMath::Max(0.f, Bloom - Dt * 6.f);
	if (Reloading > 0.f)
	{
		Reloading -= Dt;
		if (Reloading <= 0.f)
		{
			if (Stats.bReloadPerShell)
			{
				InMag++; InReserve--;
				if (InMag < Stats.Mag && InReserve > 0) { Reloading = Stats.ReloadTime; ReloadTotal = Stats.ReloadTime; }
			}
			else
			{
				const int32 Take = FMath::Min(Stats.Mag - InMag, InReserve);
				InMag += Take; InReserve -= Take;
			}
			return true;
		}
	}
	return false;
}

void FOZWeaponState::Consume()
{
	InMag--;
	Cooldown = Stats.FireInterval();
	Bloom = FMath::Min(Bloom + 1.f, 8.f);
	if (Stats.Mode == EOZFireMode::Bolt || Stats.Mode == EOZFireMode::Pump) BoltTime = Stats.FireInterval() * 0.9f;
	if (Reloading > 0.f && Stats.bReloadPerShell) Reloading = 0.f;
}

float OZMaterials::Density(FName Mat)
{
	static const TMap<FName, float> D = {
		{ "concrete", 2.6f }, { "brick", 2.0f }, { "metal", 3.4f }, { "sheetmetal", 1.6f }, { "wood", 0.45f },
		{ "glass", 0.2f }, { "sandbag", 1.4f }, { "dirt", 5.f }, { "rock", 5.f },
	};
	const float* V = D.Find(Mat);
	return V ? *V : 2.6f;
}

FLinearColor OZMaterials::Color(FName Mat)
{
	static const TMap<FName, FLinearColor> C = {
		{ "concrete", FLinearColor(0.27f, 0.27f, 0.25f) }, { "brick", FLinearColor(0.32f, 0.1f, 0.06f) },
		{ "metal", FLinearColor(0.1f, 0.12f, 0.14f) }, { "sheetmetal", FLinearColor(0.16f, 0.2f, 0.23f) },
		{ "wood", FLinearColor(0.27f, 0.13f, 0.05f) }, { "glass", FLinearColor(0.5f, 0.7f, 0.8f) },
		{ "sandbag", FLinearColor(0.38f, 0.3f, 0.16f) }, { "dirt", FLinearColor(0.15f, 0.11f, 0.06f) }, { "rock", FLinearColor(0.2f, 0.19f, 0.17f) },
	};
	const FLinearColor* V = C.Find(Mat);
	return V ? *V : FLinearColor(0.3f, 0.3f, 0.3f);
}
